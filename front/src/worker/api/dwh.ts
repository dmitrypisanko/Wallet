import * as t from './types';
// import { IAttribute } from '../../app/api/types';
import * as mapKeys from 'lodash/fp/mapKeys';
import * as pick from 'lodash/fp/pick';
import { TypeEthereumAddress } from '../../app/api/runtime-types';
import * as tcomb from 'tcomb';
import { BN } from 'bn.js';
import { EnumProfileStatus, IBenchmarkMap } from '../../app/api/types';
import * as moment from 'moment';
import * as get from 'lodash/fp/get';

interface IDictionary<T> {
    [index: string]: keyof T;
}

const ATTRIBUTE_DESCRIPTION = 1103;

const NETWORK_OVERLAY = 0x1;
const NETWORK_OUTBOUND = 0x2;
const NETWORK_INCOMING = 0x4;

const DEFAULT_NODES: t.INodes = {
    livenet: 'https://dwh.livenet.sonm.com:15022/DWHServer/',
    rinkeby: 'https://dwh-testnet.sonm.com:15022/DWHServer/',
};

export class DWH {
    private url: string;

    constructor(network: string = 'rinkeby') {
        this.setNetworkURL(network);
    }

    public setNetworkURL(network: string) {
        this.url = DEFAULT_NODES[network];
    }

    public getUrl() {
        return this.url;
    }

    public static readonly emptyFilter = {};

    public static readonly benchmarkMap: Array<
        [number /*code*/, string, number /*multiplier*/]
    > = [
        [2, 'cpuCount', 1],
        [7, 'gpuCount', 1],
        [3, 'ramSize', 1024 * 1024],
        [4, 'storageSize', 1024 * 1024 * 1024],
        [11, 'redshiftGPU', 1],
        [10, 'zcashHashrate', 1],
        [9, 'ethHashrate', 1000 * 1000],
        [8, 'gpuRamSize', 1024 * 1024],
    ];

    public static readonly mapProfile: IDictionary<t.IProfileBrief> = {
        UserID: 'address',
        IdentityLevel: 'status',
        Name: 'name',
        Country: 'country',
        activeAsks: 'sellOrders',
        activeBids: 'buyOrders',
    };
    public static renameProfileKeys = mapKeys((x: string) => DWH.mapProfile[x]);
    public static pickProfileKeys = pick(
        (Object as any).values(DWH.mapProfile),
    );

    public static readonly defaultProfile: t.IProfileBrief = {
        name: '',
        address: '0x0',
        status: t.EnumProfileStatus.anonimest,
        sellOrders: 0,
        buyOrders: 0,
        deals: 0,
        country: '',
        logoUrl: '',
    };

    public static readonly mapAttributes: any = {
        [t.EnumAttributes.Website]: ['Website', self.atob],
        [t.EnumAttributes.Phone]: ['Telephone', self.atob],
        [t.EnumAttributes.Email]: ['E-mail', self.atob],
        [t.EnumAttributes.SocNet]: ['Service link', self.atob],
    };

    public static readonly mapKycAttributes: any = {
        [t.EnumAttributes.Name]: ['name', self.atob],
        [t.EnumAttributes.Kyc2]: ['kyc2', self.atob],
        [t.EnumAttributes.Kyc3]: ['kyc3', self.atob],
        [t.EnumAttributes.Kyc4]: ['kyc4', self.atob],
    };

    public static kycAttributesToStatus = {
        [t.EnumAttributes.Kyc2]: t.EnumProfileStatus.reg,
        [t.EnumAttributes.Kyc3]: t.EnumProfileStatus.ident,
        [t.EnumAttributes.Kyc4]: t.EnumProfileStatus.ident,
    };

    private processProfile(item: any): t.IProfileBrief {
        const renamed = DWH.renameProfileKeys(item);
        const picked = DWH.pickProfileKeys(renamed);
        const result = { ...DWH.defaultProfile, ...picked };

        return result as t.IProfileBrief;
    }

    public getProfiles = async ({
        filter,
        limit,
        offset,
        sortBy,
        sortDesc,
    }: t.IListQuery): Promise<t.IListResult<t.IProfileBrief>> => {
        tcomb.maybe(tcomb.String)(filter);
        tcomb.Number(limit);
        tcomb.Number(offset);
        tcomb.maybe(tcomb.String)(sortBy);
        tcomb.maybe(tcomb.Boolean)(sortDesc);

        const mongoLikeFilter = filter ? JSON.parse(filter) : {};
        let sortField = 'userId';
        switch (sortBy) {
            case 'address':
                sortField = 'UserID';
                break;
            case 'status':
                sortField = 'IdentityLevel';
                break;
            case 'buyOrders':
                sortField = 'activeBids';
                break;
            case 'sellOrders':
                sortField = 'activeAsks';
                break;
            case 'country':
                sortField = sortBy;
                break;
            default:
                break;
        }

        const res = await this.fetchData('GetProfiles', {
            offset,
            limit,
            identifier:
                mongoLikeFilter.query && mongoLikeFilter.query.$like
                    ? `%${mongoLikeFilter.query.$like}%`
                    : null,
            country:
                mongoLikeFilter.country && mongoLikeFilter.country.$in.length
                    ? mongoLikeFilter.country.$in.map((item: string) =>
                          item.toLowerCase(),
                      )
                    : null,
            identityLevel:
                !mongoLikeFilter.status || mongoLikeFilter.status.$gte <= 1
                    ? 0
                    : mongoLikeFilter.status.$gte,
            role: mongoLikeFilter.role ? mongoLikeFilter.role.$eq : 0,
            sortings: [
                {
                    field: sortField,
                    order: sortDesc ? 1 : 0,
                },
            ],
        });

        return {
            records: res.profiles ? res.profiles.map(this.processProfile) : [],
            total: res && res.count ? res.count : 0,
        };
    };

    public getProfileFull = async ({
        address,
    }: any): Promise<t.IProfileFull> => {
        TypeEthereumAddress(address);

        const res = await this.fetchData('GetProfileInfo', { Id: address });
        if (res) {
            const brief = this.processProfile(res);
            const certificates = res.Certificates
                ? JSON.parse(res.Certificates)
                : [];
            const attrMap: any = {};
            const attributes = certificates
                .map((x: any) => {
                    attrMap[x.attribute] = x;

                    if (x.attribute in DWH.mapAttributes) {
                        const [label, converter] = DWH.mapAttributes[
                            x.attribute
                        ];

                        if (x.value !== undefined) {
                            let value = '';
                            try {
                                value = converter(x.value);
                            } catch (err) {
                                console.error(['Converter failed', x.value]);
                                console.error(err.stack);
                            }

                            return {
                                value,
                                label,
                            };
                        }
                    }
                    return undefined;
                })
                .filter(Boolean);

            const description =
                ATTRIBUTE_DESCRIPTION in attrMap
                    ? self.atob(attrMap[ATTRIBUTE_DESCRIPTION].value)
                    : '';

            return {
                ...brief,
                attributes,
                description,
                certificates: this.getKycCertificates(certificates),
            };
        } else {
            return {
                ...DWH.defaultProfile,
                address,
                certificates: [],
                attributes: [],
                description: '',
            };
        }
    };

    protected static priceMultiplierOut = new BN('1000000000000000000').div(
        new BN('3600'),
    );

    public static recalculatePriceOut(price: string) {
        const multiplier = 1000000;

        return String(
            new BN(String(parseFloat(price) * multiplier))
                .mul(DWH.priceMultiplierOut)
                .div(new BN(multiplier)),
        );
    }

    public getOrders = async ({
        limit,
        offset,
        filter,
        sortBy,
        sortDesc,
    }: t.IListQuery): Promise<t.IListResult<t.IOrder>> => {
        tcomb.Number(limit);
        tcomb.Number(offset);
        tcomb.maybe(tcomb.String)(filter);
        tcomb.maybe(tcomb.String)(sortBy);
        tcomb.maybe(tcomb.Boolean)(sortDesc);

        let sortField = 'id';
        switch (sortBy) {
            case 'price':
                sortField = 'Price';
                break;
            case 'duration':
                sortField = 'Duration';
                break;
            default:
                const find = DWH.benchmarkMap.find(item => item[1] === sortBy);
                if (find) {
                    sortField = `Benchmark${find[0]}`;
                }
                break;
        }

        const mongoLikeQuery = filter ? JSON.parse(filter) : DWH.emptyFilter;
        const benchmarks =
            'benchmarkMap' in mongoLikeQuery
                ? DWH.getBenchmarksFilter(mongoLikeQuery.benchmarkMap)
                : {};

        const request = {
            masterID: get('creator.address.$eq', mongoLikeQuery),
            type: get('orderSide.$eq', mongoLikeQuery),
            creatorIdentityLevel: get('creator.status.$in', mongoLikeQuery),
            status: get('orderStatus.$eq', mongoLikeQuery),
            price: DWH.getMinMaxFilter(
                get('price', mongoLikeQuery),
                DWH.recalculatePriceOut,
            ),
            benchmarks:
                Object.keys(benchmarks).length !== 0 ? benchmarks : null,
            offset,
            limit,
            sortings: [
                {
                    field: sortField,
                    order: sortDesc ? 1 : 0,
                },
            ],
            counterpartyID: [
                '0x0000000000000000000000000000000000000000',
                get('profileAddress.$eq', mongoLikeQuery),
            ],
        };

        const response = await this.fetchData('GetOrders', request);

        const records = response.orders
            ? response.orders.map(DWH.parseOrder)
            : [];

        return {
            records,
            total: response.count ? response.count : 0,
        };
    };

    protected static getBenchmarksFilter = (benchmarkRanges: {
        [k: string]: { $gte?: string; $lte?: string };
    }) => {
        return DWH.benchmarkMap
            .map(([code, name, multiplier]) => [
                code,
                name,
                DWH.getMinMaxFilter(
                    benchmarkRanges[name],
                    (x: any) => Number(x) * multiplier,
                ),
            ])
            .filter(([code, name, value]) => value)
            .reduce(
                (acc, [code, name, value]) => {
                    acc[String(code)] = value;
                    return acc;
                },
                {} as any,
            );
    };

    public static readonly getMinMaxFilter = (
        value: { $gte?: string; $lte?: string },
        converter: (a: string) => number | string | boolean = Number,
    ) => {
        if (value && ('$gte' in value || '$lte' in value)) {
            return {
                min: value.$gte === undefined ? null : converter(value.$gte),
                max: value.$lte === undefined ? null : converter(value.$lte),
            };
        }
        return undefined;
    };

    public getOrderFull = async ({ id }: any): Promise<t.IOrder> => {
        const res = await this.fetchData('GetOrderDetails', id);
        return DWH.parseOrder(res);
    };

    public static parseBenchmarks(
        benchmarks: any,
        netflags: number = 0,
    ): IBenchmarkMap {
        return {
            cpuSysbenchMulti: benchmarks.values[0] || 0,
            cpuSysbenchOne: benchmarks.values[1] || 0,
            cpuCount: benchmarks.values[2] || 0,
            ramSize: Math.round(benchmarks.values[3] / (1024 * 1024)) || 0,
            storageSize:
                Math.round(benchmarks.values[4] / (1024 * 1024 * 1024)) || 10,
            downloadNetSpeed:
                Math.round(benchmarks.values[5] / (1024 * 1024)) || 0,
            uploadNetSpeed:
                Math.round(benchmarks.values[6] / (1024 * 1024)) || 0,
            gpuCount: benchmarks.values[7] || 0,
            gpuRamSize: Math.round(benchmarks.values[8] / (1024 * 1024)) || 0,
            ethHashrate:
                Math.round((100 * benchmarks.values[9]) / (1000 * 1000)) /
                    100 || 0,
            zcashHashrate: benchmarks.values[10] || 0,
            redshiftGpu: benchmarks.values[11] || 0,
            networkOverlay: Boolean(netflags & NETWORK_OVERLAY),
            networkOutbound: Boolean(netflags & NETWORK_OUTBOUND),
            networkIncoming: Boolean(netflags & NETWORK_INCOMING),
        };
    }

    public static parseOrder(item: any): t.IOrder {
        const order = {
            ...item.order,
        };

        order.benchmarkMap = DWH.parseBenchmarks(
            item.order.benchmarks,
            item.order.netflags.flags,
        );
        order.duration = order.duration ? DWH.parseDuration(order.duration) : 0;
        order.price = DWH.recalculatePriceIn(order.price);

        order.creator = {
            status: item.creatorIdentityLevel || EnumProfileStatus.anonimest,
            name: item.creatorName || '',
            address: item.masterID || order.authorID,
        };

        return order;
    }

    public static recalculatePriceIn(price: number) {
        return String(new BN(price).mul(new BN(3600)));
    }

    public static parseDuration(duration: number) {
        return duration;
    }

    public getDealFull = async ({ id }: any): Promise<t.IDeal> => {
        const res = await this.fetchData('GetDealDetails', id);
        return this.parseDeal(res);
    };

    public getDeals = async ({
        limit,
        offset,
        filter,
    }: t.IListQuery): Promise<t.IListResult<t.IDeal>> => {
        tcomb.Number(limit);
        tcomb.Number(offset);
        tcomb.maybe(tcomb.String)(filter);

        const mongoLikeQuery = filter ? JSON.parse(filter) : {};
        const res = await this.fetchData('GetDeals', {
            offset,
            anyUserID: mongoLikeQuery.address
                ? mongoLikeQuery.address.$eq
                : null,
            limit,
            sortings: [
                {
                    field: 'StartTime',
                    order: 1,
                },
            ],
            WithCount: true,
        });
        const records = [] as t.IDeal[];

        if (res && res.deals) {
            for (const item of res.deals) {
                records.push(this.parseDeal(item));
            }
        }

        return {
            records,
            total: res && res.count ? res.count : 0,
        };
    };

    private parseCertificate(data: string): any {
        const attrMap = {} as any;

        try {
            JSON.parse(self.atob(data)).map((x: any) => {
                if (x.attribute in DWH.mapKycAttributes) {
                    const [label, converter] = DWH.mapKycAttributes[
                        x.attribute
                    ];
                    attrMap[label] = converter(x.value);
                }
            });

            if (attrMap.kyc4) {
                attrMap.status = EnumProfileStatus.pro;
            } else if (attrMap.kyc3) {
                attrMap.status = EnumProfileStatus.ident;
            }
        } catch {}

        return attrMap;
    }

    protected getKycCertificates(certificates: any[]): t.ICertificate[] {
        return certificates
            .filter(x => x.attribute in DWH.kycAttributesToStatus)
            .map(x => ({
                status: (DWH.kycAttributesToStatus as any)[x.attribute],
                address: x.validatorID,
            }));
    }

    private parseDeal(item: any): t.IDeal {
        const deal = {
            ...item.deal,
        };

        const consumer = this.parseCertificate(item.consumerCertificates);
        const supplier = this.parseCertificate(item.supplierCertificates);

        deal.benchmarkMap = DWH.parseBenchmarks(
            item.deal.benchmarks,
            item.netflags,
        );
        deal.supplier = {
            address: deal.masterID,
            status: supplier.status || EnumProfileStatus.anonimest,
            name: supplier.name || '',
        };
        deal.consumer = {
            address: deal.consumerID,
            status: consumer.status || EnumProfileStatus.anonimest,
            name: consumer.name || '',
        };
        deal.duration = deal.duration ? DWH.parseDuration(deal.duration) : 0;
        deal.price = DWH.recalculatePriceIn(deal.price);
        deal.startTime = deal.startTime
            ? parseInt(moment(deal.startTime).format('X'), 10)
            : 0;
        deal.endTime =
            deal.endTime && deal.endTime
                ? parseInt(moment(deal.endTime).format('X'), 10)
                : 0;

        const now = moment().unix();
        deal.timeLeft =
            deal.endTime && now < deal.endTime ? deal.endTime - now : 0;

        return deal;
    }

    public getValidators = async (): Promise<t.IKycValidator[]> => {
        const res = await this.fetchData('GetValidators');
        const validators = 'validators' in res ? res.validators : [];

        return validators.filter((x: any) => x.url).map(
            ({
                validator,
                name,
                level,
                price,
                url,
                description,
                icon,
            }: any): t.IKycValidator => ({
                id: validator.id,
                level: validator.level,
                name,
                description,
                fee: price,
                url,
                logo: icon,
            }),
        );
    };

    public getWorkers = async ({
        limit,
        offset,
        filter,
    }: t.IListQuery): Promise<t.IListResult<t.IWorker>> => {
        tcomb.Number(limit);
        tcomb.Number(offset);
        tcomb.maybe(tcomb.String)(filter);

        const mongoLikeQuery = filter ? JSON.parse(filter) : {};
        const address = get('address.$eq', mongoLikeQuery);

        if (address) {
            const res = await this.fetchData('GetWorkers', {
                masterID: address,
                limit,
                offset,
                WithCount: true,
            });

            const workers = 'workers' in res ? res.workers : [];
            return {
                records: workers.map(
                    ({ slaveID, confirmed }: any): t.IWorker => ({
                        slaveId: slaveID,
                        confirmed: !!confirmed,
                    }),
                ),
                total: 'count' in res ? res.count : 0,
            };
        } else {
            return {
                records: [],
                total: 0,
            };
        }
    };

    private async fetchData(method: string, params: any = {}) {
        const response = await fetch(`${this.url}${method}`, {
            method: 'POST',
            body: JSON.stringify(params),
        });

        if (response && response.status === 200) {
            return response.json();
        } else {
            return false;
        }
    }
}
