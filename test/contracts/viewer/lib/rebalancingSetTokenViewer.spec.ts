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
  LinearAuctionLiquidatorContract,
  OracleWhiteListContract,
  PerformanceFeeCalculatorContract,
  RebalancingSetTokenContract,
  RebalancingSetTokenFactoryContract,
  RebalancingSetTokenV3Contract,
  RebalancingSetTokenV3FactoryContract,
  SetTokenContract,
  SetTokenFactoryContract,
  StandardTokenMockContract,
  TransferProxyContract,
  TWAPLiquidatorContract,
  VaultContract,
  WhiteListContract,
} from 'set-protocol-contracts';
import {
  UpdatableOracleMockContract,
} from 'set-protocol-oracles';
import {
  RebalancingSetTokenViewerContract,
} from '@utils/contracts';
import { ether } from '@utils/units';
import {
  ONE_DAY_IN_SECONDS,
  ONE_YEAR_IN_SECONDS,
  DEFAULT_AUCTION_PRICE_NUMERATOR,
  DEFAULT_AUCTION_PRICE_DIVISOR,
  DEFAULT_REBALANCE_TIME_TO_PIVOT,
  DEFAULT_REBALANCE_START_PRICE,
  DEFAULT_REBALANCING_NATURAL_UNIT,
  ZERO,
  ONE_HOUR_IN_SECONDS,
} from '@utils/constants';
import { expectRevertError } from '@utils/tokenAssertions';

import {
  Blockchain,
  CoreHelper,
  ERC20Helper,
  FeeCalculatorHelper,
  LiquidatorHelper,
  RebalancingHelper,
  RebalancingSetV3Helper,
  ValuationHelper,
} from 'set-protocol-contracts';
import {
  OracleHelper
} from 'set-protocol-oracles';
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
  const feeCalculatorHelper = new FeeCalculatorHelper(deployerAccount);
  const oracleHelper = new OracleHelper(deployerAccount);
  const rebalancingHelper = new RebalancingHelper(
    deployerAccount,
    coreHelper,
    erc20Helper,
    blockchain
  );
  const rebalancingSetV3Helper = new RebalancingSetV3Helper(
    deployerAccount,
    coreHelper,
    erc20Helper,
    blockchain
  );
  const valuationHelper = new ValuationHelper(deployerAccount, coreHelper, erc20Helper, oracleHelper);
  const liquidatorHelper = new LiquidatorHelper(deployerAccount, erc20Helper, valuationHelper);
  const viewerHelper = new ProtocolViewerHelper(deployerAccount);

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

    rebalancingSetTokenViewer = await viewerHelper.deployRebalancingSetTokenViewerAsync();
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

  describe('RebalancingSetTokenV2/V3', async () => {
    let rebalancingSetTokenV3Factory: RebalancingSetTokenV3FactoryContract;
    let rebalancingSetTokenV3: RebalancingSetTokenV3Contract;

    let oracleWhiteList: OracleWhiteListContract;

    let wrappedETH: StandardTokenMockContract;
    let wrappedBTC: StandardTokenMockContract;
    let usdc: StandardTokenMockContract;
    let dai: StandardTokenMockContract;

    let set1: SetTokenContract;
    let set2: SetTokenContract;

    let collateralComponents: Address[];
    let set1Units: BigNumber[];
    let set1NaturalUnit: BigNumber;

    let set2Units: BigNumber[];
    let set2NaturalUnit: BigNumber;

    let firstSetUnits: BigNumber;
    let lastRebalanceTimestamp: BigNumber;

    let wrappedETHOracle: UpdatableOracleMockContract;
    let wrappedBTCOracle: UpdatableOracleMockContract;
    let usdcOracle: UpdatableOracleMockContract;
    let daiOracle: UpdatableOracleMockContract;

    let wrappedETHPrice: BigNumber;
    let wrappedBTCPrice: BigNumber;
    let usdcPrice: BigNumber;
    let daiPrice: BigNumber;

    let liquidatorWhitelist: WhiteListContract;
    let feeCalculatorWhitelist: WhiteListContract;
    let performanceFeeCalculator: PerformanceFeeCalculatorContract;
    let liquidator: LinearAuctionLiquidatorContract;
    let twapLiquidator: TWAPLiquidatorContract;

    beforeEach(async () => {
      // Oracles
      wrappedETH = await erc20Helper.deployTokenAsync(deployerAccount, 18);
      await rebalancingComponentWhiteList.addAddress.sendTransactionAsync(wrappedETH.address);
      wrappedBTC = await erc20Helper.deployTokenAsync(deployerAccount, 8);
      await rebalancingComponentWhiteList.addAddress.sendTransactionAsync(wrappedBTC.address);
      usdc = await erc20Helper.deployTokenAsync(deployerAccount, 6);
      await rebalancingComponentWhiteList.addAddress.sendTransactionAsync(usdc.address);
      dai = await erc20Helper.deployTokenAsync(deployerAccount, 18);
      await rebalancingComponentWhiteList.addAddress.sendTransactionAsync(dai.address);

      await erc20Helper.approveTransfersAsync([wrappedBTC, wrappedETH, dai, usdc], transferProxy.address);

      wrappedETHPrice = ether(128);
      wrappedBTCPrice = ether(7500);
      usdcPrice = ether(1);
      daiPrice = ether(1);

      wrappedETHOracle = await oracleHelper.deployUpdatableOracleMockAsync(wrappedETHPrice);
      wrappedBTCOracle = await oracleHelper.deployUpdatableOracleMockAsync(wrappedBTCPrice);
      usdcOracle = await oracleHelper.deployUpdatableOracleMockAsync(usdcPrice);
      daiOracle = await oracleHelper.deployUpdatableOracleMockAsync(daiPrice);

      oracleWhiteList = await coreHelper.deployOracleWhiteListAsync(
        [wrappedETH.address, wrappedBTC.address, usdc.address, dai.address],
        [wrappedETHOracle.address, wrappedBTCOracle.address, usdcOracle.address, daiOracle.address],
      );

      // Liquidators
      const auctionPeriod = ONE_DAY_IN_SECONDS;
      const rangeStart = new BigNumber(1); // 1% above fair value
      const rangeEnd = new BigNumber(23); // 23% below fair value
      liquidator = await liquidatorHelper.deployLinearAuctionLiquidatorAsync(
        coreMock.address,
        oracleWhiteList.address,
        auctionPeriod,
        rangeStart,
        rangeEnd,
        'LinearLiquidator',
      );

      const twapRangeStart = ether(.01);
      const twapRangeEnd = ether(.23);
      const assetPairBounds = [
        {
          assetOne: wrappedETH.address,
          assetTwo: wrappedBTC.address,
          bounds: {lower: ether(10 ** 4).toString(), upper: ether(10 ** 6).toString()},
        },
      ];
      twapLiquidator = await viewerHelper.deployTWAPLiquidatorAsync(
        coreMock.address,
        oracleWhiteList.address,
        auctionPeriod,
        twapRangeStart,
        twapRangeEnd,
        assetPairBounds,
        'TWAPLiquidator',
      );
      liquidatorWhitelist = await coreHelper.deployWhiteListAsync([liquidator.address, twapLiquidator.address]);

      // Fee Calculators
      const maxProfitFeePercentage = ether(.5);
      const maxStreamingFeePercentage = ether(.1);
      performanceFeeCalculator = await feeCalculatorHelper.deployPerformanceFeeCalculatorAsync(
        coreMock.address,
        oracleWhiteList.address,
        maxProfitFeePercentage,
        maxStreamingFeePercentage
      );
      feeCalculatorWhitelist = await coreHelper.deployWhiteListAsync([performanceFeeCalculator.address]);

      // RebalancingSetTokenV3Factory
      rebalancingSetTokenV3Factory = await viewerHelper.deployRebalancingSetTokenV3FactoryAsync(
        coreMock.address,
        rebalancingComponentWhiteList.address,
        liquidatorWhitelist.address,
        feeCalculatorWhitelist.address,
      );
      await coreHelper.addFactoryAsync(coreMock, rebalancingSetTokenV3Factory);

      // Collateral Sets
      collateralComponents = [wrappedETH.address, wrappedBTC.address];
      set1Units = [wrappedBTCPrice.div(wrappedETHPrice).mul(10 ** 12), new BigNumber(100)];
      set1NaturalUnit = new BigNumber(10 ** 12);
      set1 = await coreHelper.createSetTokenAsync(
        coreMock,
        factory.address,
        collateralComponents,
        set1Units,
        set1NaturalUnit,
      );

      set2Units = [wrappedBTCPrice.div(wrappedETHPrice).mul(10 ** 12), new BigNumber(300)];
      set2NaturalUnit = new BigNumber(10 ** 12);
      set2 = await coreHelper.createSetTokenAsync(
        coreMock,
        factory.address,
        collateralComponents,
        set2Units,
        set2NaturalUnit,
      );

      // Deploy RebalancingSetTokenV3
      const failPeriod = ONE_DAY_IN_SECONDS;
      const { timestamp } = await web3.eth.getBlock('latest');
      lastRebalanceTimestamp = new BigNumber(timestamp).sub(ONE_DAY_IN_SECONDS);
      const calculatorData = feeCalculatorHelper.generatePerformanceFeeCallDataBuffer(
        ONE_DAY_IN_SECONDS.mul(30),
        ONE_YEAR_IN_SECONDS,
        ether(.2),
        ether(.02)
      );

      const firstNaturalUnit = DEFAULT_REBALANCING_NATURAL_UNIT;
      const firstSetValue = await valuationHelper.calculateSetTokenValueAsync(set1, oracleWhiteList);
      firstSetUnits = new BigNumber(100).mul(firstNaturalUnit).mul(10 ** 18).div(firstSetValue).round(0, 3);
      const firstSetCallData = rebalancingSetV3Helper.generateRebalancingSetTokenV3CallData(
        managerAccount,
        twapLiquidator.address,
        managerAccount,
        performanceFeeCalculator.address,
        ONE_DAY_IN_SECONDS,
        failPeriod,
        lastRebalanceTimestamp,
        ZERO,
        calculatorData
      );

      rebalancingSetTokenV3 = await rebalancingSetV3Helper.createRebalancingTokenV3Async(
        coreMock,
        rebalancingSetTokenV3Factory.address,
        [set1.address],
        [firstSetUnits],
        firstNaturalUnit,
        firstSetCallData
      );
    });

    describe('#fetchNewRebalancingSetDetails', async () => {
      let subjectRebalancingSet: Address;

      beforeEach(async () => {
        subjectRebalancingSet = rebalancingSetTokenV3.address;
      });

      async function subject(): Promise<any> {
        return rebalancingSetTokenViewer.fetchNewRebalancingSetDetails.callAsync(
          subjectRebalancingSet
        );
      }

      it('fetches the correct RebalancingSetTokenV3/TradingPool data', async () => {
        const [ tradingPoolInfo, , , ] = await subject();

        expect(tradingPoolInfo.manager).to.equal(managerAccount);
        expect(tradingPoolInfo.feeRecipient).to.equal(managerAccount);
        expect(tradingPoolInfo.currentSet).to.equal(set1.address);
        expect(tradingPoolInfo.liquidator).to.equal(twapLiquidator.address);
        expect(tradingPoolInfo.name).to.equal('Rebalancing Set Token');
        expect(tradingPoolInfo.symbol).to.equal('RBSET');
        expect(tradingPoolInfo.unitShares).to.be.bignumber.equal(firstSetUnits);
        expect(tradingPoolInfo.naturalUnit).to.be.bignumber.equal(DEFAULT_REBALANCING_NATURAL_UNIT);
        expect(tradingPoolInfo.rebalanceInterval).to.be.bignumber.equal(ONE_DAY_IN_SECONDS);
        expect(tradingPoolInfo.entryFee).to.be.bignumber.equal(ZERO);
        expect(tradingPoolInfo.lastRebalanceTimestamp).to.be.bignumber.equal(lastRebalanceTimestamp);
        expect(tradingPoolInfo.rebalanceState).to.be.bignumber.equal(ZERO);
      });

      it('fetches the correct RebalancingSetTokenV3/Performance Fee data', async () => {
        const [ , performanceFeeState, , ] = await subject();
        const [
          profitFeePeriod,
          highWatermarkResetPeriod,
          profitFeePercentage,
          streamingFeePercentage,
          highWatermark,
          lastProfitFeeTimestamp,
          lastStreamingFeeTimestamp,
        ] = performanceFeeState;

        const expectedFeeStates: any = await performanceFeeCalculator.feeState.callAsync(rebalancingSetTokenV3.address);

        expect(profitFeePeriod).to.equal(expectedFeeStates.profitFeePeriod);
        expect(highWatermarkResetPeriod).to.equal(expectedFeeStates.highWatermarkResetPeriod);
        expect(profitFeePercentage).to.equal(expectedFeeStates.profitFeePercentage);
        expect(streamingFeePercentage).to.equal(expectedFeeStates.streamingFeePercentage);
        expect(highWatermark).to.equal(expectedFeeStates.highWatermark);
        expect(lastProfitFeeTimestamp).to.equal(expectedFeeStates.lastProfitFeeTimestamp);
        expect(lastStreamingFeeTimestamp).to.equal(expectedFeeStates.lastStreamingFeeTimestamp);
      });

      it('fetches the correct CollateralSet data', async () => {
        const [ , , collateralSetData, ] = await subject();

        expect(JSON.stringify(collateralSetData.components)).to.equal(JSON.stringify(collateralComponents));
        expect(JSON.stringify(collateralSetData.units)).to.equal(JSON.stringify(set1Units));
        expect(collateralSetData.naturalUnit).to.be.bignumber.equal(set1NaturalUnit);
        expect(collateralSetData.name).to.equal('Set Token');
        expect(collateralSetData.symbol).to.equal('SET');
      });

      it('fetches the correct PerformanceFeeCalculator address', async () => {
        const [ , , , performanceFeeCalculatorAddress ] = await subject();

        expect(performanceFeeCalculatorAddress).to.equal(performanceFeeCalculator.address);
      });
    });

    describe('#fetchRBSetTWAPRebalanceDetails', async () => {
      let subjectRebalancingSet: Address;

      let currentSetToken: SetTokenContract;
      let nextSet: SetTokenContract;

      beforeEach(async () => {
        currentSetToken = set1;
        nextSet = set2;

        // Issue currentSetToken
        await coreMock.issue.sendTransactionAsync(
          currentSetToken.address,
          ether(8),
          {from: deployerAccount}
        );
        await erc20Helper.approveTransfersAsync([currentSetToken], transferProxy.address);

        // Use issued currentSetToken to issue rebalancingSetToken
        const rebalancingSetQuantityToIssue = ether(7);
        await coreMock.issue.sendTransactionAsync(rebalancingSetTokenV3.address, rebalancingSetQuantityToIssue);

        await blockchain.increaseTimeAsync(ONE_DAY_IN_SECONDS);

        const liquidatorData = liquidatorHelper.generateTWAPLiquidatorCalldata(
          ether(10 ** 5),
          ONE_HOUR_IN_SECONDS,
        );

        await rebalancingSetTokenV3.startRebalance.sendTransactionAsync(
          nextSet.address,
          liquidatorData,
          { from: managerAccount }
        );

        subjectRebalancingSet = rebalancingSetTokenV3.address;
      });

      async function subject(): Promise<any> {
        return rebalancingSetTokenViewer.fetchRBSetTWAPRebalanceDetails.callAsync(
          subjectRebalancingSet
        );
      }

      it('fetches the correct RebalancingSetTokenV2/TradingPool data', async () => {
        const [ rbSetData, ] = await subject();

        const auctionPriceParams = await rebalancingSetTokenV3.getAuctionPriceParameters.callAsync();
        const startingCurrentSets = await rebalancingSetTokenV3.startingCurrentSetAmount.callAsync();
        const biddingParams = await rebalancingSetTokenV3.getBiddingParameters.callAsync();

        expect(rbSetData.rebalanceStartTime).to.be.bignumber.equal(auctionPriceParams[0]);
        expect(rbSetData.timeToPivot).to.be.bignumber.equal(auctionPriceParams[1]);
        expect(rbSetData.startPrice).to.be.bignumber.equal(auctionPriceParams[2]);
        expect(rbSetData.endPrice).to.be.bignumber.equal(auctionPriceParams[3]);
        expect(rbSetData.startingCurrentSets).to.be.bignumber.equal(startingCurrentSets);
        expect(rbSetData.remainingCurrentSets).to.be.bignumber.equal(biddingParams[1]);
        expect(rbSetData.minimumBid).to.be.bignumber.equal(biddingParams[0]);
        expect(rbSetData.rebalanceState).to.be.bignumber.equal(new BigNumber(2));
        expect(rbSetData.nextSet).to.equal(nextSet.address);
        expect(rbSetData.liquidator).to.equal(twapLiquidator.address);
      });

      it('fetches the correct CollateralSet data', async () => {
        const [ , collateralSetData ] = await subject();

        expect(JSON.stringify(collateralSetData.components)).to.equal(JSON.stringify(collateralComponents));
        expect(JSON.stringify(collateralSetData.units)).to.equal(JSON.stringify(set2Units));
        expect(collateralSetData.naturalUnit).to.be.bignumber.equal(set2NaturalUnit);
        expect(collateralSetData.name).to.equal('Set Token');
        expect(collateralSetData.symbol).to.equal('SET');
      });
    });

    describe('#fetchRBSetRebalanceDetails', async () => {
      let subjectRebalancingSet: Address;

      let currentSetToken: SetTokenContract;
      let nextSet: SetTokenContract;

      beforeEach(async () => {
        currentSetToken = set1;
        nextSet = set2;

        // Issue currentSetToken
        await coreMock.issue.sendTransactionAsync(
          currentSetToken.address,
          ether(8),
          {from: deployerAccount}
        );
        await erc20Helper.approveTransfersAsync([currentSetToken], transferProxy.address);

        // Use issued currentSetToken to issue rebalancingSetToken
        const rebalancingSetQuantityToIssue = ether(7);
        await coreMock.issue.sendTransactionAsync(rebalancingSetTokenV3.address, rebalancingSetQuantityToIssue);

        await blockchain.increaseTimeAsync(ONE_DAY_IN_SECONDS);

        const liquidatorData = liquidatorHelper.generateTWAPLiquidatorCalldata(
          ether(10 ** 5),
          ONE_HOUR_IN_SECONDS,
        );

        await rebalancingSetTokenV3.setLiquidator.sendTransactionAsync(liquidator.address, { from: managerAccount });

        await rebalancingSetTokenV3.startRebalance.sendTransactionAsync(
          nextSet.address,
          liquidatorData,
          { from: managerAccount }
        );

        subjectRebalancingSet = rebalancingSetTokenV3.address;
      });

      async function subject(): Promise<any> {
        return rebalancingSetTokenViewer.fetchRBSetRebalanceDetails.callAsync(
          subjectRebalancingSet
        );
      }

      it('fetches the correct RebalancingSetTokenV2/TradingPool data', async () => {
        const [ rbSetData, ] = await subject();

        const auctionPriceParams = await rebalancingSetTokenV3.getAuctionPriceParameters.callAsync();
        const startingCurrentSets = await rebalancingSetTokenV3.startingCurrentSetAmount.callAsync();
        const biddingParams = await rebalancingSetTokenV3.getBiddingParameters.callAsync();

        expect(rbSetData.rebalanceStartTime).to.be.bignumber.equal(auctionPriceParams[0]);
        expect(rbSetData.timeToPivot).to.be.bignumber.equal(auctionPriceParams[1]);
        expect(rbSetData.startPrice).to.be.bignumber.equal(auctionPriceParams[2]);
        expect(rbSetData.endPrice).to.be.bignumber.equal(auctionPriceParams[3]);
        expect(rbSetData.startingCurrentSets).to.be.bignumber.equal(startingCurrentSets);
        expect(rbSetData.remainingCurrentSets).to.be.bignumber.equal(biddingParams[1]);
        expect(rbSetData.minimumBid).to.be.bignumber.equal(biddingParams[0]);
        expect(rbSetData.rebalanceState).to.be.bignumber.equal(new BigNumber(2));
        expect(rbSetData.nextSet).to.equal(nextSet.address);
        expect(rbSetData.liquidator).to.equal(liquidator.address);
      });

      it('fetches the correct CollateralSet data', async () => {
        const [ , collateralSetData ] = await subject();

        expect(JSON.stringify(collateralSetData.components)).to.equal(JSON.stringify(collateralComponents));
        expect(JSON.stringify(collateralSetData.units)).to.equal(JSON.stringify(set2Units));
        expect(collateralSetData.naturalUnit).to.be.bignumber.equal(set2NaturalUnit);
        expect(collateralSetData.name).to.equal('Set Token');
        expect(collateralSetData.symbol).to.equal('SET');
      });
    });

    describe('Batch Fetching Functions', async () => {
      let otherRebalancingSetV3: RebalancingSetTokenV3Contract;

      beforeEach(async () => {
        const failPeriod = ONE_DAY_IN_SECONDS;
        const { timestamp } = await web3.eth.getBlock('latest');
        lastRebalanceTimestamp = new BigNumber(timestamp).sub(ONE_DAY_IN_SECONDS);
        const calculatorData = feeCalculatorHelper.generatePerformanceFeeCallDataBuffer(
          ONE_DAY_IN_SECONDS.mul(30),
          ONE_YEAR_IN_SECONDS,
          ether(.2),
          ether(.02)
        );

        const firstNaturalUnit = DEFAULT_REBALANCING_NATURAL_UNIT;
        const firstSetValue = await valuationHelper.calculateSetTokenValueAsync(set1, oracleWhiteList);
        firstSetUnits = new BigNumber(100).mul(firstNaturalUnit).mul(10 ** 18).div(firstSetValue).round(0, 3);
        const firstSetCallData = rebalancingSetV3Helper.generateRebalancingSetTokenV3CallData(
          managerAccount,
          liquidator.address,
          managerAccount,
          performanceFeeCalculator.address,
          ONE_DAY_IN_SECONDS,
          failPeriod,
          lastRebalanceTimestamp,
          ZERO,
          calculatorData
        );

        otherRebalancingSetV3 = await rebalancingSetV3Helper.createRebalancingTokenV3Async(
          coreMock,
          rebalancingSetTokenV3Factory.address,
          [set2.address],
          [firstSetUnits],
          firstNaturalUnit,
          firstSetCallData
        );
      });

      describe('#batchFetchLiquidator', async () => {
        let subjectRebalancingSets: Address[];

        beforeEach(async () => {
          subjectRebalancingSets = [rebalancingSetTokenV3.address, otherRebalancingSetV3.address];
        });

        async function subject(): Promise<any> {
          return rebalancingSetTokenViewer.batchFetchLiquidator.callAsync(
            subjectRebalancingSets
          );
        }

        it('fetches the correct liquidator array', async () => {
          const liquidators = await subject();

          const expectedLiquidators = [twapLiquidator.address, liquidator.address];
          expect(JSON.stringify(liquidators)).to.equal(JSON.stringify(expectedLiquidators));
        });
      });

      describe('#batchFetchStateAndCollateral', async () => {
        let subjectRebalancingSets: Address[];

        beforeEach(async () => {
          // Issue currentSetToken
          await coreMock.issue.sendTransactionAsync(
            set1.address,
            ether(8),
            {from: deployerAccount}
          );
          await erc20Helper.approveTransfersAsync([set1], transferProxy.address);

          // Use issued currentSetToken to issue rebalancingSetToken
          const rebalancingSetQuantityToIssue = ether(7);
          await coreMock.issue.sendTransactionAsync(rebalancingSetTokenV3.address, rebalancingSetQuantityToIssue);

          await blockchain.increaseTimeAsync(ONE_DAY_IN_SECONDS);

          const liquidatorData = liquidatorHelper.generateTWAPLiquidatorCalldata(
            ether(10 ** 5),
            ONE_HOUR_IN_SECONDS,
          );

          await rebalancingSetTokenV3.startRebalance.sendTransactionAsync(
            set2.address,
            liquidatorData,
            { from: managerAccount }
          );

          subjectRebalancingSets = [rebalancingSetTokenV3.address, otherRebalancingSetV3.address];
        });

        async function subject(): Promise<any> {
          return rebalancingSetTokenViewer.batchFetchStateAndCollateral.callAsync(
            subjectRebalancingSets
          );
        }

        it('fetches the correct liquidator array', async () => {
          const statuses: any[] = await subject();

          expect(statuses[0].collateralSet).to.equal(set1.address);
          expect(statuses[1].collateralSet).to.equal(set2.address);
          expect(statuses[0].state).to.be.bignumber.equal(new BigNumber(2));
          expect(statuses[1].state).to.be.bignumber.equal(ZERO);
        });
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
