import { hexStringToBytes, padTo32BytesStart } from './utils';

export const getCiphertextIV = (ciphertext: string[]): Buffer => {
    const ivTag = padTo32BytesStart(ciphertext[0]).substring(2);
    return Buffer.from(ivTag.substring(0, 32), 'hex');
};

export const getCiphertextTag = (ciphertext: string[]): Buffer => {
    const ivTag = padTo32BytesStart(ciphertext[0]).substring(2);
    return Buffer.from(ivTag.substring(32), 'hex');
};

// @TODO multiple stripping of 0x prefix and appending is happening here and can be removed
export const getCiphertextData = (ciphertext: string[]): Buffer[] => {
    const data = ciphertext.slice(1).map((dataField) => {
        return hexStringToBytes(padTo32BytesStart(dataField.toString()));
    });
    return data;
};
