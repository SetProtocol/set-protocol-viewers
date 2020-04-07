require('module-alias/register');

import * as ABIDecoder from 'abi-decoder';
import * as chai from 'chai';
import * as setProtocolUtils from 'set-protocol-utils';
import { Address } from 'set-protocol-utils';
import { BigNumber } from 'bignumber.js';

import ChaiSetup from '@utils/chaiSetup';
import { BigNumberSetup } from '@utils/bigNumberSetup';
import {
  ConstantAuctionPriceCurveContract,
  CoreMockContract,
  RebalancingSetTokenContract,
  RebalancingSetTokenFactoryContract,
  SetTokenContract,
  SetTokenFactoryContract,
  TransferProxyContract,
  VaultContract,
  WhiteListContract,
} from 'set-protocol-contracts';
import {
  RebalancingSetTokenViewerContract,
} from '@utils/contracts';
import { ether } from '@utils/units';
import {
  ONE_DAY_IN_SECONDS,
  DEFAULT_AUCTION_PRICE_NUMERATOR,
  DEFAULT_AUCTION_PRICE_DIVISOR,
  DEFAULT_REBALANCE_TIME_TO_PIVOT,
  DEFAULT_REBALANCE_START_PRICE,
  ZERO,
} from '@utils/constants';
import { expectRevertError } from '@utils/tokenAssertions';

import {
  Blockchain,
  CoreHelper,
  ERC20Helper,
  RebalancingHelper,
} from 'set-protocol-contracts';
import { ProtocolViewerHelper } from '@utils/helpers/protocolViewerHelper';

const CoreMock =
  require('set-protocol-contracts/dist/artifacts/ts/CoreMock').CoreMock;

BigNumberSetup.configure();
ChaiSetup.configure();
const { SetProtocolUtils: SetUtils } = setProtocolUtils;
const blockchain = new Blockchain(web3);
const { expect } = chai;
const { NULL_ADDRESS } = SetUtils.CONSTANTS;


contract('RebalancingSetTokenViewer', accounts => {
  const [
    deployerAccount,
    managerAccount,
    ownerAccount,
  ] = accounts;

  let coreMock: CoreMockContract;
  let transferProxy: TransferProxyContract;
  let vault: VaultContract;
  let factory: SetTokenFactoryContract;
  let rebalancingComponentWhiteList: WhiteListContract;
  let rebalancingFactory: RebalancingSetTokenFactoryContract;
  let constantAuctionPriceCurve: ConstantAuctionPriceCurveContract;

  const coreHelper = new CoreHelper(deployerAccount, deployerAccount);
  const erc20Helper = new ERC20Helper(deployerAccount);
  const protocolViewerHelper = new ProtocolViewerHelper(deployerAccount);
  const rebalancingHelper = new RebalancingHelper(
    deployerAccount,
    coreHelper,
    erc20Helper,
    blockchain
  );

  let rebalancingSetTokenViewer: RebalancingSetTokenViewerContract;

  before(async () => {
    ABIDecoder.addABI(CoreMock.abi);
  });

  after(async () => {
    ABIDecoder.removeABI(CoreMock.abi);
  });

  beforeEach(async () => {
    await blockchain.saveSnapshotAsync();

    transferProxy = await coreHelper.deployTransferProxyAsync();
    vault = await coreHelper.deployVaultAsync();
    coreMock = await coreHelper.deployCoreMockAsync(transferProxy, vault);

    factory = await coreHelper.deploySetTokenFactoryAsync(coreMock.address);
    rebalancingComponentWhiteList = await coreHelper.deployWhiteListAsync();
    rebalancingFactory = await coreHelper.deployRebalancingSetTokenFactoryAsync(
      coreMock.address,
      rebalancingComponentWhiteList.address,
    );
    constantAuctionPriceCurve = await rebalancingHelper.deployConstantAuctionPriceCurveAsync(
      DEFAULT_AUCTION_PRICE_NUMERATOR,
      DEFAULT_AUCTION_PRICE_DIVISOR,
    );

    await coreHelper.setDefaultStateAndAuthorizationsAsync(coreMock, vault, transferProxy, factory);
    await coreHelper.addFactoryAsync(coreMock, rebalancingFactory);
    await rebalancingHelper.addPriceLibraryAsync(coreMock, constantAuctionPriceCurve);

    rebalancingSetTokenViewer = await protocolViewerHelper.deployRebalancingSetTokenViewerAsync();
  });

  afterEach(async () => {
    await blockchain.revertAsync();
  });

  describe('#fetchRebalanceProposalStateAsync', async () => {
    let subjectRebalancingSetAddress: Address;

    let rebalancingSetToken: RebalancingSetTokenContract;
    let nextSetToken: SetTokenContract;

    beforeEach(async () => {
      const naturalUnits = [ether(.001), ether(.0001)];

      const setTokens = await rebalancingHelper.createSetTokensAsync(
        coreMock,
        factory.address,
        transferProxy.address,
        2,
        naturalUnits
      );

      const currentSetToken = setTokens[0];
      nextSetToken = setTokens[1];

      rebalancingSetToken = await rebalancingHelper.createDefaultRebalancingSetTokenAsync(
        coreMock,
        rebalancingFactory.address,
        managerAccount,
        currentSetToken.address,
        ONE_DAY_IN_SECONDS
      );

      // Issue currentSetToken
      await coreMock.issue.sendTransactionAsync(currentSetToken.address, ether(8), {from: deployerAccount});
      await erc20Helper.approveTransfersAsync([currentSetToken], transferProxy.address);

      // Use issued currentSetToken to issue rebalancingSetToken
      const rebalancingSetTokenQuantityToIssue = ether(8);
      await coreMock.issue.sendTransactionAsync(rebalancingSetToken.address, rebalancingSetTokenQuantityToIssue);

      subjectRebalancingSetAddress = rebalancingSetToken.address;
    });

    async function subject(): Promise<any> {
      return rebalancingSetTokenViewer.fetchRebalanceProposalStateAsync.callAsync(
        subjectRebalancingSetAddress,
      );
    }

    it('fetches the RebalancingSetToken\'s current proposal\'s parameters', async () => {
      const rebalanceProposalState: any[] = await subject();

      const rebalancingSetState = rebalanceProposalState[0];
      expect(rebalancingSetState).to.be.bignumber.equal(SetUtils.REBALANCING_STATE.DEFAULT);

      const [nextSetAddress, auctionLibraryAddress] = rebalanceProposalState[1];
      expect(nextSetAddress).to.equal(NULL_ADDRESS);
      expect(auctionLibraryAddress).to.equal(NULL_ADDRESS);

      const [
        proposalStartTime,
        auctionTimeToPivot,
        auctionStartPrice,
        auctionPivotPrice,
      ] = rebalanceProposalState[2];
      expect(proposalStartTime).to.be.bignumber.equal(ZERO);
      expect(auctionTimeToPivot).to.be.bignumber.equal(ZERO);
      expect(auctionStartPrice).to.be.bignumber.equal(ZERO);
      expect(auctionPivotPrice).to.be.bignumber.equal(ZERO);
    });

    describe('when the token address is not for a RebalancingSetToken contract', async () => {
      beforeEach(async () => {
        subjectRebalancingSetAddress = ownerAccount;
      });

      it('should revert', async () => {
        await expectRevertError(subject());
      });
    });

    describe('when the rebalancing set is in propose state', async () => {
      beforeEach(async () => {
        await rebalancingHelper.defaultTransitionToProposeAsync(
          coreMock,
          rebalancingComponentWhiteList,
          rebalancingSetToken,
          nextSetToken,
          constantAuctionPriceCurve.address,
          managerAccount
        );
      });

      it('should revert', async () => {
        const rebalanceProposalState: any[] = await subject();

        const rebalancingSetState = rebalanceProposalState[0];
        expect(rebalancingSetState).to.be.bignumber.equal(SetUtils.REBALANCING_STATE.PROPOSAL);

        const [nextSetAddress, auctionLibraryAddress] = rebalanceProposalState[1];
        expect(nextSetAddress).to.equal(nextSetToken.address);
        expect(auctionLibraryAddress).to.equal(constantAuctionPriceCurve.address);

        const [
          proposalStartTime,
          auctionTimeToPivot,
          auctionStartPrice,
          auctionPivotPrice,
        ] = rebalanceProposalState[2];
        expect(auctionTimeToPivot).to.be.bignumber.equal(DEFAULT_REBALANCE_TIME_TO_PIVOT);
        expect(auctionStartPrice).to.be.bignumber.equal(DEFAULT_REBALANCE_START_PRICE);
        expect(auctionPivotPrice).to.be.bignumber.equal(DEFAULT_AUCTION_PRICE_NUMERATOR);

        const expectedProposalStartTime = await rebalancingSetToken.proposalStartTime.callAsync();
        expect(proposalStartTime).to.be.bignumber.equal(expectedProposalStartTime);
      });
    });
  });

  describe('#fetchRebalanceAuctionStateAsync', async () => {
    let subjectRebalancingSetAddress: Address;

    let rebalancingSetToken: RebalancingSetTokenContract;
    let currentSetToken: SetTokenContract;
    let nextSetToken: SetTokenContract;

    beforeEach(async () => {
      const naturalUnits = [ether(.001), ether(.0001)];

      const setTokens = await rebalancingHelper.createSetTokensAsync(
        coreMock,
        factory.address,
        transferProxy.address,
        2,
        naturalUnits
      );

      currentSetToken = setTokens[0];
      nextSetToken = setTokens[1];

      rebalancingSetToken = await rebalancingHelper.createDefaultRebalancingSetTokenAsync(
        coreMock,
        rebalancingFactory.address,
        managerAccount,
        currentSetToken.address,
        ONE_DAY_IN_SECONDS
      );

      // Issue currentSetToken
      await coreMock.issue.sendTransactionAsync(currentSetToken.address, ether(8), {from: deployerAccount});
      await erc20Helper.approveTransfersAsync([currentSetToken], transferProxy.address);

      // Use issued currentSetToken to issue rebalancingSetToken
      const rebalancingSetTokenQuantityToIssue = ether(8);
      await coreMock.issue.sendTransactionAsync(rebalancingSetToken.address, rebalancingSetTokenQuantityToIssue);

      subjectRebalancingSetAddress = rebalancingSetToken.address;
    });

    async function subject(): Promise<any> {
      return rebalancingSetTokenViewer.fetchRebalanceAuctionStateAsync.callAsync(
        subjectRebalancingSetAddress,
      );
    }

    it('fetches the RebalancingSetToken\'s current auction\'s parameters', async () => {
      const rebalanceAuctionState: any[] = await subject();

      const rebalancingSetState = rebalanceAuctionState[0];
      expect(rebalancingSetState).to.be.bignumber.equal(SetUtils.REBALANCING_STATE.DEFAULT);

      const [
        startingCurrentSetAmount,
        auctionStartTime,
        minimumBid,
        remainingCurrentSets,
      ] = rebalanceAuctionState[1];
      expect(startingCurrentSetAmount).to.be.bignumber.equal(ZERO);
      expect(auctionStartTime).to.be.bignumber.equal(ZERO);
      expect(minimumBid).to.be.bignumber.equal(ZERO);
      expect(remainingCurrentSets).to.be.bignumber.equal(ZERO);
    });

    describe('when the token address is not for a RebalancingSetToken contract', async () => {
      beforeEach(async () => {
        subjectRebalancingSetAddress = ownerAccount;
      });

      it('should revert', async () => {
        await expectRevertError(subject());
      });
    });

    describe('when the rebalancing set is in propose state', async () => {
      beforeEach(async () => {
        await rebalancingHelper.defaultTransitionToProposeAsync(
          coreMock,
          rebalancingComponentWhiteList,
          rebalancingSetToken,
          nextSetToken,
          constantAuctionPriceCurve.address,
          managerAccount
        );
      });

      it('fetches the RebalancingSetToken\'s current auction\'s parameters', async () => {
        const rebalanceAuctionState: any[] = await subject();

        const rebalancingSetState = rebalanceAuctionState[0];
        expect(rebalancingSetState).to.be.bignumber.equal(SetUtils.REBALANCING_STATE.PROPOSAL);

        const [
          startingCurrentSetAmount,
          auctionStartTime,
          minimumBid,
          remainingCurrentSets,
        ] = rebalanceAuctionState[1];
        expect(startingCurrentSetAmount).to.be.bignumber.equal(ZERO);
        expect(auctionStartTime).to.be.bignumber.equal(ZERO);
        expect(minimumBid).to.be.bignumber.equal(ZERO);
        expect(remainingCurrentSets).to.be.bignumber.equal(ZERO);
      });
    });

    describe('when the rebalancing set is in rebalance state', async () => {
      beforeEach(async () => {
        await rebalancingHelper.defaultTransitionToRebalanceAsync(
          coreMock,
          rebalancingComponentWhiteList,
          rebalancingSetToken,
          nextSetToken,
          constantAuctionPriceCurve.address,
          managerAccount
        );
      });

      it('fetches the RebalancingSetToken\'s current auction\'s parameters', async () => {
        const rebalanceAuctionState: any[] = await subject();

        const rebalancingSetState = rebalanceAuctionState[0];
        expect(rebalancingSetState).to.be.bignumber.equal(SetUtils.REBALANCING_STATE.REBALANCE);

        const [
          startingCurrentSetAmount,
          auctionStartTime,
          minimumBid,
        ] = rebalanceAuctionState[1];

        const expectedStartingCurrentSetAmount = await rebalancingSetToken.startingCurrentSetAmount.callAsync();
        expect(startingCurrentSetAmount).to.be.bignumber.equal(expectedStartingCurrentSetAmount);

        const [expectedAuctionStartTime] = await rebalancingSetToken.getAuctionPriceParameters.callAsync();
        expect(auctionStartTime).to.be.bignumber.equal(expectedAuctionStartTime);

        const [
          expectedMinimumBid,
          expectedRemainingCurrentSets,
        ] = await rebalancingSetToken.getBiddingParameters.callAsync();
        expect(minimumBid).to.be.bignumber.equal(expectedMinimumBid);
        expect(expectedRemainingCurrentSets).to.be.bignumber.equal(expectedRemainingCurrentSets);
      });
    });
  });

  describe('#batchFetchRebalanceStateAsync', async () => {
    let subjectRebalancingSetAddresses: Address[];

    let rebalancingSetToken: RebalancingSetTokenContract;
    let currentSetToken: SetTokenContract;
    let nextSetToken: SetTokenContract;

    let defaultRebalancingSetToken: RebalancingSetTokenContract;

    beforeEach(async () => {
      const naturalUnits = [ether(.001), ether(.0001)];

      const setTokens = await rebalancingHelper.createSetTokensAsync(
        coreMock,
        factory.address,
        transferProxy.address,
        2,
        naturalUnits
      );

      currentSetToken = setTokens[0];
      nextSetToken = setTokens[1];

      rebalancingSetToken = await rebalancingHelper.createDefaultRebalancingSetTokenAsync(
        coreMock,
        rebalancingFactory.address,
        managerAccount,
        currentSetToken.address,
        ONE_DAY_IN_SECONDS
      );

      // Issue currentSetToken
      await coreMock.issue.sendTransactionAsync(currentSetToken.address, ether(8), {from: deployerAccount});
      await erc20Helper.approveTransfersAsync([currentSetToken], transferProxy.address);

      // Use issued currentSetToken to issue rebalancingSetToken
      const rebalancingSetTokenQuantityToIssue = ether(8);
      await coreMock.issue.sendTransactionAsync(rebalancingSetToken.address, rebalancingSetTokenQuantityToIssue);

      // Transition original rebalancing set to proposal
      await rebalancingHelper.defaultTransitionToProposeAsync(
          coreMock,
          rebalancingComponentWhiteList,
          rebalancingSetToken,
          nextSetToken,
          constantAuctionPriceCurve.address,
          managerAccount
        );

      defaultRebalancingSetToken = await rebalancingHelper.createDefaultRebalancingSetTokenAsync(
        coreMock,
        rebalancingFactory.address,
        managerAccount,
        currentSetToken.address,
        ONE_DAY_IN_SECONDS
      );

      subjectRebalancingSetAddresses = [rebalancingSetToken.address, defaultRebalancingSetToken.address];
    });

    async function subject(): Promise<BigNumber[]> {
      return rebalancingSetTokenViewer.batchFetchRebalanceStateAsync.callAsync(
        subjectRebalancingSetAddresses,
      );
    }

    it('fetches the RebalancingSetTokens\' states', async () => {
      const rebalanceAuctionStates: BigNumber[] = await subject();

      const firstRebalancingSetState = rebalanceAuctionStates[0];
      expect(firstRebalancingSetState).to.be.bignumber.equal(SetUtils.REBALANCING_STATE.PROPOSAL);

      const secondRebalancingSetState = rebalanceAuctionStates[1];
      expect(secondRebalancingSetState).to.be.bignumber.equal(SetUtils.REBALANCING_STATE.DEFAULT);
    });
  });

  describe('#batchFetchUnitSharesAsync', async () => {
    let subjectRebalancingSetAddresses: Address[];

    let rebalancingSetToken: RebalancingSetTokenContract;
    let setTokenOne: SetTokenContract;
    let setTokenTwo: SetTokenContract;

    let defaultRebalancingSetToken: RebalancingSetTokenContract;

    beforeEach(async () => {
      const naturalUnits = [ether(.001), ether(.0001)];

      const setTokens = await rebalancingHelper.createSetTokensAsync(
        coreMock,
        factory.address,
        transferProxy.address,
        2,
        naturalUnits
      );

      setTokenOne = setTokens[0];
      setTokenTwo = setTokens[1];

      rebalancingSetToken = await rebalancingHelper.createDefaultRebalancingSetTokenAsync(
        coreMock,
        rebalancingFactory.address,
        managerAccount,
        setTokenOne.address,
        ONE_DAY_IN_SECONDS
      );

      defaultRebalancingSetToken = await rebalancingHelper.createDefaultRebalancingSetTokenAsync(
        coreMock,
        rebalancingFactory.address,
        managerAccount,
        setTokenTwo.address,
        ONE_DAY_IN_SECONDS
      );

      subjectRebalancingSetAddresses = [rebalancingSetToken.address, defaultRebalancingSetToken.address];
    });

    async function subject(): Promise<BigNumber[]> {
      return rebalancingSetTokenViewer.batchFetchUnitSharesAsync.callAsync(
        subjectRebalancingSetAddresses,
      );
    }

    it('fetches the RebalancingSetTokens\' unitShares', async () => {
      const rebalanceUnitShares: BigNumber[] = await subject();

      const firstUnitShares = rebalanceUnitShares[0];
      const firstExpectedUnitShares = await rebalancingSetToken.unitShares.callAsync();
      expect(firstUnitShares).to.be.bignumber.equal(firstExpectedUnitShares);

      const secondUnitShares = rebalanceUnitShares[1];
      const secondExpectedUnitShares = await defaultRebalancingSetToken.unitShares.callAsync();
      expect(secondUnitShares).to.be.bignumber.equal(secondExpectedUnitShares);
    });
  });
});
