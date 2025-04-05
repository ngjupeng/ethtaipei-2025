import {
  getChecksumAddress,
  RpcProvider,
  validateChecksumAddress,
} from 'starknet';
import { ErrorStarknet } from '../common/constants/errors';

export async function validateStarknetAddress(
  address: string,
  provider: RpcProvider,
) {
  try {
    if (
      !validateChecksumAddress(getChecksumAddress(address)) ||
      !address.startsWith('0x')
    ) {
      throw new Error(ErrorStarknet.InvalidAddress);
    }
    address = getChecksumAddress(address);
    await provider.getClassHashAt(address);
    return [address, true];
  } catch (_error) {
    return [address, false];
  }
}
