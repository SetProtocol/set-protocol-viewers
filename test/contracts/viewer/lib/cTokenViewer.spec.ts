require('module-alias/register');

import * as ABIDecoder from 'abi-decoder';
import * as chai from 'chai';
import { Address } from 'set-protocol-utils';
import { BigNumber } from 'bignumber.js';

import ChaiSetup from '@utils/chaiSetup';
import { BigNumberSetup } from '@utils/bigNumberSetup';
import {
  CTokenViewerContract,
} from '@utils/contracts';
import { expectRevertError } from '@utils/tokenAssertions';

import {
  Blockchain,
  CompoundHelper,
  ERC20Helper,
} from 'set-protocol-contracts';
import { ProtocolViewerHelper } from '@utils/helpers/protocolViewerHelper';

const CoreMock =
  require('set-protocol-contracts/dist/artifacts/ts/CoreMock').CoreMock;

BigNumberSetup.configure();
ChaiSetup.configure();
const blockchain = new Blockchain(web3);
const { expect } = chai;

contract('CTokenViewer', accounts => {
  const [
    deployerAccount,
    managerAccount,
  ] = accounts;

  let cUSDCAddress: Address;
  let cDAIAddress: Address;

  const compoundHelper = new CompoundHelper(deployerAccount);
  const erc20Helper = new ERC20Helper(deployerAccount);
  const protocolViewerHelper = new ProtocolViewerHelper(deployerAccount);

  let cTokenViewer: CTokenViewerContract;

  before(async () => {
    ABIDecoder.addABI(CoreMock.abi);
  });

  after(async () => {
    ABIDecoder.removeABI(CoreMock.abi);
  });

  beforeEach(async () => {
    await blockchain.saveSnapshotAsync();

    // Set up Compound USDC token
    const usdcInstance = await erc20Helper.deployTokenAsync(
      deployerAccount,
      6,
    );

    cUSDCAddress = await compoundHelper.deployMockCUSDC(usdcInstance.address, deployerAccount);

    await compoundHelper.enableCToken(cUSDCAddress);
    // Set the Borrow Rate
    await compoundHelper.setBorrowRate(cUSDCAddress, new BigNumber('43084603999'));

    // Set up Compound DAI token
    const daiInstance = await erc20Helper.deployTokenAsync(
      deployerAccount,
      18,
    );
    cDAIAddress = await compoundHelper.deployMockCDAI(daiInstance.address, deployerAccount);
    await compoundHelper.enableCToken(cDAIAddress);
    // Set the Borrow Rate
    await compoundHelper.setBorrowRate(cDAIAddress, new BigNumber('29313252165'));

    cTokenViewer = await protocolViewerHelper.deployCTokenViewerAsync();
  });

  afterEach(async () => {
    await blockchain.revertAsync();
  });

  describe('#batchFetchExchangeRateStored', async () => {
    let subjectTokenAddresses: Address[];

    beforeEach(async () => {
      subjectTokenAddresses = [cUSDCAddress, cDAIAddress];
    });

    async function subject(): Promise<BigNumber[]> {
      return cTokenViewer.batchFetchExchangeRateStored.callAsync(
        subjectTokenAddresses,
      );
    }

    it('fetches the exchangeRates of the token addresses', async () => {
      const exchangeRates: BigNumber[] = await subject();
      const exchangeRatesJSON = JSON.stringify(exchangeRates);
      const expectedExchangeRates: BigNumber[] = [];

      for (let i = 0; i < subjectTokenAddresses.length; i++) {
        const expectedExchangeRate = await compoundHelper.getExchangeRate(subjectTokenAddresses[i]);

        expectedExchangeRates.push(expectedExchangeRate);
      }
      const expectedExchangeRatesJSON = JSON.stringify(expectedExchangeRates);

      expect(exchangeRatesJSON).to.equal(expectedExchangeRatesJSON);
    });

    describe('when the token addresses includes a non cToken contract', async () => {
      beforeEach(async () => {
        subjectTokenAddresses = [managerAccount];
      });

      it('should revert', async () => {
        await expectRevertError(subject());
      });
    });
  });
});
