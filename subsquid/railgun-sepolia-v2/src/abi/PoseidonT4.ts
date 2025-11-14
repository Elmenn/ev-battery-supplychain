import * as ethers from 'ethers'
import {LogEvent, Func, ContractBase} from './abi.support'
import {ABI_JSON} from './PoseidonT4.abi'

export const abi = new ethers.Interface(ABI_JSON);

export const events = {
    NullEvent: new LogEvent<[]>(
        abi, '0x6f59c82101949290205a9ae9d0c657e6dae1a71c301ae76d385c2792294585fe'
    ),
}

export const functions = {
    'poseidon(bytes32[3])': new Func<[input: Array<string>], {input: Array<string>}, string>(
        abi, '0x5a53025d'
    ),
    'poseidon(uint256[3])': new Func<[input: Array<bigint>], {input: Array<bigint>}, bigint>(
        abi, '0x25cc70e8'
    ),
}

export class Contract extends ContractBase {

    'poseidon(bytes32[3])'(input: Array<string>): Promise<string> {
        return this.eth_call(functions['poseidon(bytes32[3])'], [input])
    }

    'poseidon(uint256[3])'(input: Array<bigint>): Promise<bigint> {
        return this.eth_call(functions['poseidon(uint256[3])'], [input])
    }
}
