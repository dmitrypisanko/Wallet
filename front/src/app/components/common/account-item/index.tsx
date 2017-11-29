import * as React from 'react';
import { IdentIcon } from '../ident-icon';
import * as cn from 'classnames';
import { Icon } from 'antd';

export interface IAccountItemProps {
    className?: string;
    address: string;
    name: string;
    firstBalance: string;
    secondBalance: string;
    onRename: (newName: string, address: string) => void;
}

export class AccountItem extends React.Component<IAccountItemProps, any> {
    public state  = {
        isEdit: false,
    };

    private inputRef?: any;

    public render() {
        const {
            className,
            address,
            etherBalance,
            sonmBalance,
        } = this.props;

        return (
            <div className={cn('sonm-account-item', className)}>
                <IdentIcon address={address} className="sonm-account-item__blockies"/>
                <span className="sonm-account-item__name">
                    <span>
                        {this.renderName()}
                    </span>
                </span>
                <span className="sonm-account-item__ether">{etherBalance} ETH</span>
                <span className="sonm-account-item__address">{address}</span>
                <span className="sonm-account-item__sonm">{sonmBalance} SNM</span>
            </div>
        );
    }

    private focusOnInput = () => {
        if (this.inputRef) {
            this.inputRef.focus();
        }
    }

    private startEdit = () => {
        this.setState({
            isEdit: true,
        }, this.focusOnInput);
    }

    private handleKeyUp = (event: any) => {
        if (event.keyCode === 13) {
            event.preventDefault();
            this.stopEdit();
        }
    }

    private stopEdit = () => {
        const text = this.inputRef.value;

        this.props.onRename(this.props.address, text);

        this.setState({
            isEdit: false,
        });
    }

    private saveRef = (ref: any) => {
        this.inputRef = ref;
    }

    public renderName() {
        const {
            name,
            onRename,
        } = this.props;

        if (onRename === undefined) {
            return [name];
        }

        if (this.state.isEdit) {
            return [
                <input
                    required
                    spellCheck={false}
                    defaultValue={this.props.name}
                    ref={this.saveRef}
                    key="c"
                    type="text"
                    className="sonm-account-item__edit-name "
                    onKeyUp={this.handleKeyUp}
                />,
            ];
        } else {
            return [
                name,
                <Icon
                    key="i"
                    className="sonm-account-item__edit-icon"
                    type="edit"
                    onClick={this.startEdit}
                />,
            ];
        }
    }
}

export default AccountItem;
