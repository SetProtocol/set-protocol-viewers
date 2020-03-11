require('module-alias/register');

import * as chai from 'chai';
import { Address } from 'set-protocol-utils';
import { BigNumber } from 'bignumber.js';

import ChaiSetup from '@utils/chaiSetup';
import { BigNumberSetup } from '@utils/bigNumberSetup';
import {
  ManagerViewerContract,
  TrendingManagerMockContract
} from '@utils/contracts';

import {
  Blockchain,
} from 'set-protocol-contracts';
import { ProtocolViewerHelper } from '@utils/helpers/protocolViewerHelper';

BigNumberSetup.configure();
ChaiSetup.configure();
const blockchain = new Blockchain(web3);
const { expect } = chai;

contract('ManagerViewer', accounts => {
  const [
    deployerAccount,
  ] = accounts;

  let trendingManagerMock1: TrendingManagerMockContract;
  let trendingManagerMock2: TrendingManagerMockContract;

  let crossoverTimestamp1: BigNumber;
  let crossoverTimestamp2: BigNumber;

  const protocolViewerHelper = new ProtocolViewerHelper(deployerAccount);

  let managerViewer: ManagerViewerContract;

  beforeEach(async () => {
    await blockchain.saveSnapshotAsync();

    crossoverTimestamp1 = new BigNumber(14800000000);
    crossoverTimestamp2 = new BigNumber(11800000000);
    trendingManagerMock1 = await protocolViewerHelper.deployTrendingManagerMockAsync(
      crossoverTimestamp1
    );
    trendingManagerMock2 = await protocolViewerHelper.deployTrendingManagerMockAsync(
      crossoverTimestamp2
    );

    managerViewer = await protocolViewerHelper.deployManagerViewerAsync();
  });

  afterEach(async () => {
    await blockchain.revertAsync();
  });

  describe('#batchFetchMACOV2CrossoverTimestamp', async () => {
    let subjectManagerAddresses: Address[];

    beforeEach(async () => {
      subjectManagerAddresses = [trendingManagerMock1.address, trendingManagerMock2.address];
    });

    async function subject(): Promise<BigNumber[]> {
      return managerViewer.batchFetchMACOV2CrossoverTimestamp.callAsync(
        subjectManagerAddresses,
      );
    }

    it('fetches the lastCrossoverConfirmationTimestamp of the MACO Managers', async () => {
      const actualCrossoverArray = await subject();

      const expectedEntryFeeArray = [crossoverTimestamp1, crossoverTimestamp2];
      expect(JSON.stringify(actualCrossoverArray)).to.equal(JSON.stringify(expectedEntryFeeArray));
    });
  });

  describe('#batchFetchAssetPairCrossoverTimestamp', async () => {
    let subjectManagerAddresses: Address[];

    beforeEach(async () => {
      subjectManagerAddresses = [trendingManagerMock1.address, trendingManagerMock2.address];
    });

    async function subject(): Promise<BigNumber[]> {
      return managerViewer.batchFetchAssetPairCrossoverTimestamp.callAsync(
        subjectManagerAddresses,
      );
    }

    it('fetches the recentInitialProposeTimestamp of the Asset Pair Managers', async () => {
      const actualCrossoverArray = await subject();

      const expectedEntryFeeArray = [crossoverTimestamp1, crossoverTimestamp2];
      expect(JSON.stringify(actualCrossoverArray)).to.equal(JSON.stringify(expectedEntryFeeArray));
    });
  });
});
