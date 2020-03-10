require('module-alias/register');

import * as _ from 'lodash';
import * as ABIDecoder from 'abi-decoder';
import * as chai from 'chai';
import { Address } from 'set-protocol-utils';
import { BigNumber } from 'bignumber.js';

import ChaiSetup from '@utils/chaiSetup';
import { BigNumberSetup } from '@utils/bigNumberSetup';
import {
  UpdatableOracleMockContract
} from 'set-protocol-oracles';
import {
  CoreMock,
  CoreMockContract,
  FixedFeeCalculatorContract,
  LinearAuctionLiquidatorContract,
  OracleWhiteListContract,
  PerformanceFeeCalculatorContract,
  SetTokenContract,
  RebalancingSetTokenV2Contract,
  RebalancingSetTokenV2FactoryContract,
  RebalancingSetTokenV3Contract,
  RebalancingSetTokenV3FactoryContract,
  SetTokenFactoryContract,
  StandardTokenMockContract,
  TransferProxyContract,
  VaultContract,
  WhiteListContract,
} from 'set-protocol-contracts';
import {
  SocialTradingManagerMockContract,
  TradingPoolViewerContract,
} from '@utils/contracts';
import { ether, gWei } from '@utils/units';
import {
  DEFAULT_REBALANCING_NATURAL_UNIT,
  DEFAULT_UNIT_SHARES,
  ONE_DAY_IN_SECONDS,
  ONE_YEAR_IN_SECONDS,
  ZERO,
} from '@utils/constants';
import { getWeb3 } from '@utils/web3Helper';

import {
  Blockchain,
  CoreHelper,
  ERC20Helper,
  FeeCalculatorHelper,
  LiquidatorHelper,
  RebalancingSetV2Helper,
  RebalancingSetV3Helper,
  ValuationHelper,
} from 'set-protocol-contracts';
import {
  OracleHelper,
} from 'set-protocol-oracles';
import { ProtocolViewerHelper } from '@utils/helpers/protocolViewerHelper';

BigNumberSetup.configure();
ChaiSetup.configure();
const web3 = getWeb3();
const { expect } = chai;
const blockchain = new Blockchain(web3);

contract('TradingPoolViewer', accounts => {
  const [
    deployerAccount,
    feeRecipient,
    trader,
    allocator,
  ] = accounts;

  let rebalancingSetToken: RebalancingSetTokenV2Contract;

  let coreMock: CoreMockContract;
  let transferProxy: TransferProxyContract;
  let vault: VaultContract;
  let setTokenFactory: SetTokenFactoryContract;
  let rebalancingFactory: RebalancingSetTokenV2FactoryContract;
  let rebalancingSetTokenV3Factory: RebalancingSetTokenV3FactoryContract;
  let rebalancingComponentWhiteList: WhiteListContract;
  let liquidatorWhitelist: WhiteListContract;
  let liquidator: LinearAuctionLiquidatorContract;
  let fixedFeeCalculator: FixedFeeCalculatorContract;
  let feeCalculatorWhitelist: WhiteListContract;

  let name: string;
  let auctionPeriod: BigNumber;
  let rangeStart: BigNumber;
  let rangeEnd: BigNumber;
  let oracleWhiteList: OracleWhiteListContract;

  let component1: StandardTokenMockContract;
  let component2: StandardTokenMockContract;

  let component1Price: BigNumber;
  let component2Price: BigNumber;

  let set1: SetTokenContract;
  let set2: SetTokenContract;

  let set1Components: Address[];
  let set1Units: BigNumber[];
  let set1NaturalUnit: BigNumber;

  let set2Components: Address[];
  let set2Units: BigNumber[];
  let set2NaturalUnit: BigNumber;

  let component1Oracle: UpdatableOracleMockContract;
  let component2Oracle: UpdatableOracleMockContract;

  let poolViewer: TradingPoolViewerContract;

  const coreHelper = new CoreHelper(deployerAccount, deployerAccount);
  const erc20Helper = new ERC20Helper(deployerAccount);
  const feeCalculatorHelper = new FeeCalculatorHelper(deployerAccount);
  const oracleHelper = new OracleHelper(deployerAccount);
  const rebalancingHelper = new RebalancingSetV2Helper(
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

  before(async () => {
    ABIDecoder.addABI(CoreMock.abi);
  });

  after(async () => {
    ABIDecoder.removeABI(CoreMock.abi);
  });

  beforeEach(async () => {
    blockchain.saveSnapshotAsync();

    transferProxy = await coreHelper.deployTransferProxyAsync();
    vault = await coreHelper.deployVaultAsync();
    coreMock = await coreHelper.deployCoreMockAsync(transferProxy, vault);

    setTokenFactory = await coreHelper.deploySetTokenFactoryAsync(coreMock.address);
    rebalancingComponentWhiteList = await coreHelper.deployWhiteListAsync();
    liquidatorWhitelist = await coreHelper.deployWhiteListAsync();
    feeCalculatorWhitelist = await coreHelper.deployWhiteListAsync();

    await coreHelper.setDefaultStateAndAuthorizationsAsync(coreMock, vault, transferProxy, setTokenFactory);

    component1 = await erc20Helper.deployTokenAsync(deployerAccount);
    component2 = await erc20Helper.deployTokenAsync(deployerAccount);
    await coreHelper.addTokensToWhiteList(
      [component1.address, component2.address],
      rebalancingComponentWhiteList,
    );
    await erc20Helper.approveTransfersAsync(
      [component1, component2],
      transferProxy.address
    );

    set1Components = [component1.address, component2.address];
    set1Units = [gWei(1), gWei(1)];
    set1NaturalUnit = gWei(1);
    set1 = await coreHelper.createSetTokenAsync(
      coreMock,
      setTokenFactory.address,
      set1Components,
      set1Units,
      set1NaturalUnit,
    );

    set2Components = [component1.address, component2.address];
    set2Units = [gWei(2), gWei(3)];
    set2NaturalUnit = gWei(2);
    set2 = await coreHelper.createSetTokenAsync(
      coreMock,
      setTokenFactory.address,
      set2Components,
      set2Units,
      set2NaturalUnit,
    );

    component1Price = ether(1);
    component2Price = ether(2);

    component1Oracle = await oracleHelper.deployUpdatableOracleMockAsync(component1Price);
    component2Oracle = await oracleHelper.deployUpdatableOracleMockAsync(component2Price);

    oracleWhiteList = await coreHelper.deployOracleWhiteListAsync(
      [component1.address, component2.address],
      [component1Oracle.address, component2Oracle.address],
    );

    auctionPeriod = ONE_DAY_IN_SECONDS;
    rangeStart = new BigNumber(10); // 10% above fair value
    rangeEnd = new BigNumber(10); // 10% below fair value
    name = 'liquidator';

    liquidator = await liquidatorHelper.deployLinearAuctionLiquidatorAsync(
      coreMock.address,
      oracleWhiteList.address,
      auctionPeriod,
      rangeStart,
      rangeEnd,
      name,
    );
    await coreHelper.addAddressToWhiteList(liquidator.address, liquidatorWhitelist);

    fixedFeeCalculator = await feeCalculatorHelper.deployFixedFeeCalculatorAsync();
    await coreHelper.addAddressToWhiteList(fixedFeeCalculator.address, feeCalculatorWhitelist);

    poolViewer = await viewerHelper.deployTradingPoolViewerAsync();
  });

  afterEach(async () => {
    blockchain.revertAsync();
  });

  describe('#fetchNewTradingPoolDetails', async () => {
    let subjectTradingPool: Address;

    let currentSetToken: SetTokenContract;
    let currentAllocation: BigNumber;
    let lastRebalanceTimestamp: BigNumber;
    let setManager: SocialTradingManagerMockContract;

    let newFee: BigNumber;
    let feeUpdateTimestamp: BigNumber;

    beforeEach(async () => {
      rebalancingFactory = await coreHelper.deployRebalancingSetTokenV2FactoryAsync(
        coreMock.address,
        rebalancingComponentWhiteList.address,
        liquidatorWhitelist.address,
        feeCalculatorWhitelist.address,
      );
      await coreHelper.addFactoryAsync(coreMock, rebalancingFactory);

      currentSetToken = set1;

      setManager = await viewerHelper.deploySocialTradingManagerMockAsync();

      const failPeriod = ONE_DAY_IN_SECONDS;
      const { timestamp } = await web3.eth.getBlock('latest');
      lastRebalanceTimestamp = timestamp;
      rebalancingSetToken = await rebalancingHelper.createDefaultRebalancingSetTokenV2Async(
        coreMock,
        rebalancingFactory.address,
        setManager.address,
        liquidator.address,
        feeRecipient,
        fixedFeeCalculator.address,
        currentSetToken.address,
        failPeriod,
        lastRebalanceTimestamp,
      );

      currentAllocation = ether(.6);
      await setManager.updateRecord.sendTransactionAsync(
        rebalancingSetToken.address,
        trader,
        allocator,
        currentAllocation
      );

      newFee = ether(.02);
      await setManager.updateFee.sendTransactionAsync(
        rebalancingSetToken.address,
        newFee
      );

      const block = await web3.eth.getBlock('latest');
      feeUpdateTimestamp = new BigNumber(block.timestamp);

      subjectTradingPool = rebalancingSetToken.address;
    });

    async function subject(): Promise<any> {
      return poolViewer.fetchNewTradingPoolDetails.callAsync(
        subjectTradingPool
      );
    }

    it('fetches the correct poolInfo data', async () => {
      const [ poolInfo, , ] = await subject();

      expect(poolInfo.trader).to.equal(trader);
      expect(poolInfo.allocator).to.equal(allocator);
      expect(poolInfo.currentAllocation).to.be.bignumber.equal(currentAllocation);
      expect(poolInfo.newEntryFee).to.be.bignumber.equal(newFee);
      expect(poolInfo.feeUpdateTimestamp).to.be.bignumber.equal(feeUpdateTimestamp);
    });

    it('fetches the correct RebalancingSetTokenV2/TradingPool data', async () => {
      const [ , rbSetData, ] = await subject();

      expect(rbSetData.manager).to.equal(setManager.address);
      expect(rbSetData.feeRecipient).to.equal(feeRecipient);
      expect(rbSetData.currentSet).to.equal(currentSetToken.address);
      expect(rbSetData.name).to.equal('Rebalancing Set Token');
      expect(rbSetData.symbol).to.equal('RBSET');
      expect(rbSetData.unitShares).to.be.bignumber.equal(DEFAULT_UNIT_SHARES);
      expect(rbSetData.naturalUnit).to.be.bignumber.equal(DEFAULT_REBALANCING_NATURAL_UNIT);
      expect(rbSetData.rebalanceInterval).to.be.bignumber.equal(ONE_DAY_IN_SECONDS);
      expect(rbSetData.entryFee).to.be.bignumber.equal(ZERO);
      expect(rbSetData.rebalanceFee).to.be.bignumber.equal(ZERO);
      expect(rbSetData.lastRebalanceTimestamp).to.be.bignumber.equal(lastRebalanceTimestamp);
      expect(rbSetData.rebalanceState).to.be.bignumber.equal(ZERO);
    });

    it('fetches the correct CollateralSet data', async () => {
      const [ , , collateralSetData ] = await subject();

      expect(JSON.stringify(collateralSetData.components)).to.equal(JSON.stringify(set1Components));
      expect(JSON.stringify(collateralSetData.units)).to.equal(JSON.stringify(set1Units));
      expect(collateralSetData.naturalUnit).to.be.bignumber.equal(set1NaturalUnit);
      expect(collateralSetData.name).to.equal('Set Token');
      expect(collateralSetData.symbol).to.equal('SET');
    });
  });

  describe.only('#fetchNewTradingPoolV2Details', async () => {
    let subjectTradingPool: Address;

    let ethOracleWhiteList: OracleWhiteListContract;
    let usdOracleWhiteList: OracleWhiteListContract;

    let wrappedETH: StandardTokenMockContract;
    let wrappedBTC: StandardTokenMockContract;
    let usdc: StandardTokenMockContract;
    let dai: StandardTokenMockContract;

    let collateralSet: SetTokenContract;
    let collateralSetComponents: Address[];
    let collateralSetUnits: BigNumber[];
    let collateralSetNaturalUnit: BigNumber;

    let usdWrappedETHOracle: UpdatableOracleMockContract;
    let usdWrappedBTCOracle: UpdatableOracleMockContract;
    let usdUSDCOracle: UpdatableOracleMockContract;
    let usdDaiOracle: UpdatableOracleMockContract;

    let ethWrappedETHOracle: UpdatableOracleMockContract;
    let ethWrappedBTCOracle: UpdatableOracleMockContract;
    let ethUSDCOracle: UpdatableOracleMockContract;
    let ethDaiOracle: UpdatableOracleMockContract;

    let ethPerformanceFeeCalculator: PerformanceFeeCalculatorContract;
    let usdPerformanceFeeCalculator: PerformanceFeeCalculatorContract;

    let secondRebalancingSetToken: RebalancingSetTokenV3Contract;

    beforeEach(async () => {
      rebalancingSetTokenV3Factory = await coreHelper.deployRebalancingSetTokenV3FactoryAsync(
        coreMock.address,
        rebalancingComponentWhiteList.address,
        liquidatorWhitelist.address,
        feeCalculatorWhitelist.address,
      );
      await coreHelper.addFactoryAsync(coreMock, rebalancingSetTokenV3Factory);

      wrappedETH = await erc20Helper.deployTokenAsync(deployerAccount, 18);
      wrappedBTC = await erc20Helper.deployTokenAsync(deployerAccount, 8);
      usdc = await erc20Helper.deployTokenAsync(deployerAccount, 6);
      dai = await erc20Helper.deployTokenAsync(deployerAccount, 18);

      let wrappedETHPrice: BigNumber;
      let wrappedBTCPrice: BigNumber;
      let usdcPrice: BigNumber;
      let daiPrice: BigNumber;

      wrappedETHPrice = ether(128);
      wrappedBTCPrice = ether(7500);
      usdcPrice = ether(1);
      daiPrice = ether(1);

      usdWrappedETHOracle = await oracleHelper.deployUpdatableOracleMockAsync(wrappedETHPrice);
      usdWrappedBTCOracle = await oracleHelper.deployUpdatableOracleMockAsync(wrappedBTCPrice);
      usdUSDCOracle = await oracleHelper.deployUpdatableOracleMockAsync(usdcPrice);
      usdDaiOracle = await oracleHelper.deployUpdatableOracleMockAsync(daiPrice);

      usdOracleWhiteList = await coreHelper.deployOracleWhiteListAsync(
        [wrappedETH.address, wrappedBTC.address, usdc.address, dai.address],
        [usdWrappedETHOracle.address, usdWrappedBTCOracle.address, usdUSDCOracle.address, usdDaiOracle.address],
      );

      ethWrappedETHOracle = await oracleHelper.deployUpdatableOracleMockAsync(
        wrappedETHPrice.mul(ether(1)).div(wrappedETHPrice).round(0, 3)
      );
      ethWrappedBTCOracle = await oracleHelper.deployUpdatableOracleMockAsync(
        wrappedBTCPrice.mul(ether(1)).div(wrappedETHPrice).round(0, 3)
      );
      ethUSDCOracle = await oracleHelper.deployUpdatableOracleMockAsync(
        usdcPrice.mul(ether(1)).div(wrappedETHPrice).round(0, 3)
      );
      ethDaiOracle = await oracleHelper.deployUpdatableOracleMockAsync(
        daiPrice.mul(ether(1)).div(wrappedETHPrice).round(0, 3)
      );

      ethOracleWhiteList = await coreHelper.deployOracleWhiteListAsync(
        [wrappedETH.address, wrappedBTC.address, usdc.address, dai.address],
        [ethWrappedETHOracle.address, ethWrappedBTCOracle.address, ethUSDCOracle.address, ethDaiOracle.address],
      );

      const maxProfitFeePercentage = ether(.5);
      const maxStreamingFeePercentage = ether(.1);
      ethPerformanceFeeCalculator = await feeCalculatorHelper.deployPerformanceFeeCalculatorAsync(
        coreMock.address,
        ethOracleWhiteList.address,
        maxProfitFeePercentage,
        maxStreamingFeePercentage
      );
      await coreHelper.addAddressToWhiteList(ethPerformanceFeeCalculator.address, feeCalculatorWhitelist);

      collateralSetComponents = [wrappedETH.address, wrappedBTC.address];
      collateralSetUnits = [wrappedBTCPrice.div(wrappedETHPrice).mul(10 ** 12), new BigNumber(100)];
      collateralSetNaturalUnit = new BigNumber(10 ** 12);
      collateralSet = await coreHelper.createSetTokenAsync(
        coreMock,
        setTokenFactory.address,
        collateralSetComponents,
        collateralSetUnits,
        collateralSetNaturalUnit,
      );

      const calculatorData = feeCalculatorHelper.generatePerformanceFeeCallDataBuffer(
        ONE_DAY_IN_SECONDS.mul(30),
        ONE_YEAR_IN_SECONDS,
        ether(.2),
        ether(.02)
      );

      const firstNaturalUnit = new BigNumber(10 ** 8);
      const firstSetValue = await valuationHelper.calculateSetTokenValueAsync(collateralSet, usdOracleWhiteList);
      const firstSetUnits = new BigNumber(100).mul(firstNaturalUnit).mul(10 ** 18).div(firstSetValue).round(0, 3);
      const firstSetCallData = rebalancingSetV3Helper.generateRebalancingSetTokenV3CallData(
        deployerAccount,
        liquidator.address,
        deployerAccount,
        ethPerformanceFeeCalculator.address,
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS.mul(2),
        ZERO,
        ZERO,
        calculatorData
      );

      rebalancingSetToken = await rebalancingSetV3Helper.createRebalancingTokenV3Async(
        coreMock,
        rebalancingSetTokenV3Factory.address,
        [collateralSet.address],
        [firstSetUnits],
        firstNaturalUnit,
        firstSetCallData
      );

      subjectTradingPool = rebalancingSetToken.address;
    });

    async function subject(): Promise<any> {
      return poolViewer.fetchNewTradingPoolV2Details.callAsync(
        subjectTradingPool
      );
    }

    // it('fetches the correct poolInfo data', async () => {
    //   const [ poolInfo, , ,] = await subject();

    //   expect(poolInfo.trader).to.equal(trader);
    //   expect(poolInfo.allocator).to.equal(allocator);
    //   expect(poolInfo.currentAllocation).to.be.bignumber.equal(currentAllocation);
    //   expect(poolInfo.newEntryFee).to.be.bignumber.equal(newFee);
    //   expect(poolInfo.feeUpdateTimestamp).to.be.bignumber.equal(feeUpdateTimestamp);
    // });

    it('fetches the correct RebalancingSetTokenV2/TradingPool data', async () => {
      const [ tradingPoolInfo, , ] = await subject();

      expect(tradingPoolInfo.manager).to.equal(setManager.address);
      expect(tradingPoolInfo.feeRecipient).to.equal(feeRecipient);
      expect(tradingPoolInfo.currentSet).to.equal(currentSetToken.address);
      expect(tradingPoolInfo.name).to.equal('Rebalancing Set Token');
      expect(tradingPoolInfo.symbol).to.equal('RBSET');
      expect(tradingPoolInfo.unitShares).to.be.bignumber.equal(DEFAULT_UNIT_SHARES);
      expect(tradingPoolInfo.naturalUnit).to.be.bignumber.equal(DEFAULT_REBALANCING_NATURAL_UNIT);
      expect(tradingPoolInfo.rebalanceInterval).to.be.bignumber.equal(ONE_DAY_IN_SECONDS);
      expect(tradingPoolInfo.entryFee).to.be.bignumber.equal(ZERO);
      expect(tradingPoolInfo.rebalanceFee).to.be.bignumber.equal(ZERO);
      expect(tradingPoolInfo.lastRebalanceTimestamp).to.be.bignumber.equal(lastRebalanceTimestamp);
      expect(tradingPoolInfo.rebalanceState).to.be.bignumber.equal(ZERO);
    });

    it('fetches the correct RebalancingSetTokenV3/Peformance Fee data', async () => {
      const [ , performanceFeeState, ] = await subject();
      const [
        profitFeePeriod,
        highWatermarkResetPeriod,
        profitFeePercentage,
        streamingFeePercentage,
        highWatermark,
        lastProfitFeeTimestamp,
        lastStreamingFeeTimestamp
      ] = performanceFeeState

      const expectedFeeStates: any = await ethPerformanceFeeCalculator.feeState.callAsync(rebalancingSetToken.address);

      expect(performanceFeeState.profitFeePeriod).to.equal(expectedFeeStates.profitFeePeriod);
      expect(performanceFeeState.highWatermarkResetPeriod).to.equal(expectedFeeStates.highWatermarkResetPeriod)
      expect(performanceFeeState.profitFeePercentage).to.equal(expectedFeeStates.profitFeePercentage)
      expect(performanceFeeState.streamingFeePercentage).to.equal(expectedFeeStates.streamingFeePercentage)
      expect(performanceFeeState.highWatermark).to.equal(expectedFeeStates.highWatermark)
      expect(performanceFeeState.lastProfitFeeTimestamp).to.equal(expectedFeeStates.lastProfitFeeTimestamp)
      expect(performanceFeeState.lastStreamingFeeTimestamp).to.equal(expectedFeeStates.lastStreamingFeeTimestamp)
    });

    it('fetches the correct CollateralSet data', async () => {
      const [ , , collateralSetData] = await subject();

      expect(JSON.stringify(collateralSetData.components)).to.equal(JSON.stringify(collateralSetComponents));
      expect(JSON.stringify(collateralSetData.units)).to.equal(JSON.stringify(collateralSetUnits));
      expect(collateralSetData.naturalUnit).to.be.bignumber.equal(collateralSetNaturalUnit);
      expect(collateralSetData.name).to.equal('Set Token');
      expect(collateralSetData.symbol).to.equal('SET');
    });
  });

  describe('#fetchTradingPoolRebalanceDetails', async () => {
    let subjectTradingPool: Address;
    let setManager: SocialTradingManagerMockContract;

    let newAllocation: BigNumber;
    let nextSet: SetTokenContract;

    beforeEach(async () => {
      rebalancingFactory = await coreHelper.deployRebalancingSetTokenV2FactoryAsync(
        coreMock.address,
        rebalancingComponentWhiteList.address,
        liquidatorWhitelist.address,
        feeCalculatorWhitelist.address,
      );
      await coreHelper.addFactoryAsync(coreMock, rebalancingFactory);

      const currentSetToken = set1;

      setManager = await viewerHelper.deploySocialTradingManagerMockAsync();

      const failPeriod = ONE_DAY_IN_SECONDS;
      const { timestamp } = await web3.eth.getBlock('latest');
      const lastRebalanceTimestamp = timestamp;
      rebalancingSetToken = await rebalancingHelper.createDefaultRebalancingSetTokenV2Async(
        coreMock,
        rebalancingFactory.address,
        setManager.address,
        liquidator.address,
        feeRecipient,
        fixedFeeCalculator.address,
        currentSetToken.address,
        failPeriod,
        lastRebalanceTimestamp,
      );

      const currentAllocation = ether(.6);
      await setManager.updateRecord.sendTransactionAsync(
        rebalancingSetToken.address,
        trader,
        allocator,
        currentAllocation
      );

      // Issue currentSetToken
      await coreMock.issue.sendTransactionAsync(
        currentSetToken.address,
        ether(8),
        {from: deployerAccount}
      );
      await erc20Helper.approveTransfersAsync([currentSetToken], transferProxy.address);

      // Use issued currentSetToken to issue rebalancingSetToken
      const rebalancingSetQuantityToIssue = ether(7);
      await coreMock.issue.sendTransactionAsync(rebalancingSetToken.address, rebalancingSetQuantityToIssue);

      await blockchain.increaseTimeAsync(ONE_DAY_IN_SECONDS);


      const liquidatorData = '0x';
      nextSet = set2;
      newAllocation = ether(.4);
      await setManager.rebalance.sendTransactionAsync(
        rebalancingSetToken.address,
        nextSet.address,
        newAllocation,
        liquidatorData
      );

      subjectTradingPool = rebalancingSetToken.address;
    });

    async function subject(): Promise<any> {
      return poolViewer.fetchTradingPoolRebalanceDetails.callAsync(
        subjectTradingPool
      );
    }

    it('fetches the correct poolInfo data', async () => {
      const [ poolInfo, , ] = await subject();

      expect(poolInfo.trader).to.equal(trader);
      expect(poolInfo.allocator).to.equal(allocator);
      expect(poolInfo.currentAllocation).to.be.bignumber.equal(newAllocation);
      expect(poolInfo.newEntryFee).to.be.bignumber.equal(ZERO);
      expect(poolInfo.feeUpdateTimestamp).to.be.bignumber.equal(ZERO);
    });

    it('fetches the correct RebalancingSetTokenV2/TradingPool data', async () => {
      const [ , rbSetData, ] = await subject();

      const auctionPriceParams = await rebalancingSetToken.getAuctionPriceParameters.callAsync();
      const startingCurrentSets = await rebalancingSetToken.startingCurrentSetAmount.callAsync();
      const biddingParams = await rebalancingSetToken.getBiddingParameters.callAsync();

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
      const [ , , collateralSetData ] = await subject();

      expect(JSON.stringify(collateralSetData.components)).to.equal(JSON.stringify(set2Components));
      expect(JSON.stringify(collateralSetData.units)).to.equal(JSON.stringify(set2Units));
      expect(collateralSetData.naturalUnit).to.be.bignumber.equal(set2NaturalUnit);
      expect(collateralSetData.name).to.equal('Set Token');
      expect(collateralSetData.symbol).to.equal('SET');
    });
  });

  // describe('#batchFetchTradingPoolOperator', async () => {
  //   let subjectTradingPools: Address[];

  //   let rebalancingSetToken2: RebalancingSetTokenV2Contract;
  //   let entryFee1: BigNumber;
  //   let entryFee2: BigNumber;

  //   beforeEach(async () => {
  //     rebalancingFactory = await coreHelper.deployRebalancingSetTokenV2FactoryAsync(
  //       coreMock.address,
  //       rebalancingComponentWhiteList.address,
  //       liquidatorWhitelist.address,
  //       feeCalculatorWhitelist.address,
  //     );
  //     await coreHelper.addFactoryAsync(coreMock, rebalancingFactory);

  //     const setManager = await viewerHelper.deploySocialTradingManagerMockAsync();

  //     const failPeriod = ONE_DAY_IN_SECONDS;
  //     const { timestamp } = await web3.eth.getBlock('latest');
  //     const lastRebalanceTimestamp = timestamp;

  //     entryFee1 = ether(.02);
  //     rebalancingSetToken = await rebalancingHelper.createDefaultRebalancingSetTokenV2Async(
  //       coreMock,
  //       rebalancingFactory.address,
  //       setManager.address,
  //       liquidator.address,
  //       feeRecipient,
  //       fixedFeeCalculator.address,
  //       set1.address,
  //       failPeriod,
  //       lastRebalanceTimestamp,
  //       entryFee1
  //     );

  //     entryFee2 = ether(.03);
  //     rebalancingSetToken2 = await rebalancingHelper.createDefaultRebalancingSetTokenV2Async(
  //       coreMock,
  //       rebalancingFactory.address,
  //       setManager.address,
  //       liquidator.address,
  //       feeRecipient,
  //       fixedFeeCalculator.address,
  //       set1.address,
  //       failPeriod,
  //       lastRebalanceTimestamp,
  //       entryFee2
  //     );

  //     subjectTradingPools = [rebalancingSetToken.address, rebalancingSetToken2.address];
  //   });

  //   async function subject(): Promise<any> {
  //     return poolViewer.batchFetchTradingPoolEntryFees.callAsync(
  //       subjectTradingPools
  //     );
  //   }

  //   it('fetches the correct entryFee array', async () => {
  //     const actualEntryFeeArray = await subject();

  //     const expectedEntryFeeArray = [entryFee1, entryFee2];

  //     expect(JSON.stringify(actualEntryFeeArray)).to.equal(JSON.stringify(expectedEntryFeeArray));
  //   });
  // });

  describe('#batchFetchTradingPoolEntryFees', async () => {
    let subjectTradingPools: Address[];

    let rebalancingSetToken2: RebalancingSetTokenV2Contract;
    let entryFee1: BigNumber;
    let entryFee2: BigNumber;

    beforeEach(async () => {
      rebalancingFactory = await coreHelper.deployRebalancingSetTokenV2FactoryAsync(
        coreMock.address,
        rebalancingComponentWhiteList.address,
        liquidatorWhitelist.address,
        feeCalculatorWhitelist.address,
      );
      await coreHelper.addFactoryAsync(coreMock, rebalancingFactory);

      const setManager = await viewerHelper.deploySocialTradingManagerMockAsync();

      const failPeriod = ONE_DAY_IN_SECONDS;
      const { timestamp } = await web3.eth.getBlock('latest');
      const lastRebalanceTimestamp = timestamp;

      entryFee1 = ether(.02);
      rebalancingSetToken = await rebalancingHelper.createDefaultRebalancingSetTokenV2Async(
        coreMock,
        rebalancingFactory.address,
        setManager.address,
        liquidator.address,
        feeRecipient,
        fixedFeeCalculator.address,
        set1.address,
        failPeriod,
        lastRebalanceTimestamp,
        entryFee1
      );

      entryFee2 = ether(.03);
      rebalancingSetToken2 = await rebalancingHelper.createDefaultRebalancingSetTokenV2Async(
        coreMock,
        rebalancingFactory.address,
        setManager.address,
        liquidator.address,
        feeRecipient,
        fixedFeeCalculator.address,
        set1.address,
        failPeriod,
        lastRebalanceTimestamp,
        entryFee2
      );

      subjectTradingPools = [rebalancingSetToken.address, rebalancingSetToken2.address];
    });

    async function subject(): Promise<any> {
      return poolViewer.batchFetchTradingPoolEntryFees.callAsync(
        subjectTradingPools
      );
    }

    it('fetches the correct entryFee array', async () => {
      const actualEntryFeeArray = await subject();

      const expectedEntryFeeArray = [entryFee1, entryFee2];

      expect(JSON.stringify(actualEntryFeeArray)).to.equal(JSON.stringify(expectedEntryFeeArray));
    });
  });

  describe('#batchFetchTradingPoolFeeState', async () => {
    let subjectTradingPools: Address[];

    let ethOracleWhiteList: OracleWhiteListContract;
    let usdOracleWhiteList: OracleWhiteListContract;

    let wrappedETH: StandardTokenMockContract;
    let wrappedBTC: StandardTokenMockContract;
    let usdc: StandardTokenMockContract;
    let dai: StandardTokenMockContract;

    let collateralSet: SetTokenContract;

    let usdWrappedETHOracle: UpdatableOracleMockContract;
    let usdWrappedBTCOracle: UpdatableOracleMockContract;
    let usdUSDCOracle: UpdatableOracleMockContract;
    let usdDaiOracle: UpdatableOracleMockContract;

    let ethWrappedETHOracle: UpdatableOracleMockContract;
    let ethWrappedBTCOracle: UpdatableOracleMockContract;
    let ethUSDCOracle: UpdatableOracleMockContract;
    let ethDaiOracle: UpdatableOracleMockContract;

    let ethPerformanceFeeCalculator: PerformanceFeeCalculatorContract;
    let usdPerformanceFeeCalculator: PerformanceFeeCalculatorContract;

    let secondRebalancingSetToken: RebalancingSetTokenV3Contract;

    beforeEach(async () => {
      rebalancingSetTokenV3Factory = await coreHelper.deployRebalancingSetTokenV3FactoryAsync(
        coreMock.address,
        rebalancingComponentWhiteList.address,
        liquidatorWhitelist.address,
        feeCalculatorWhitelist.address,
      );
      await coreHelper.addFactoryAsync(coreMock, rebalancingSetTokenV3Factory);

      wrappedETH = await erc20Helper.deployTokenAsync(deployerAccount, 18);
      wrappedBTC = await erc20Helper.deployTokenAsync(deployerAccount, 8);
      usdc = await erc20Helper.deployTokenAsync(deployerAccount, 6);
      dai = await erc20Helper.deployTokenAsync(deployerAccount, 18);

      let wrappedETHPrice: BigNumber;
      let wrappedBTCPrice: BigNumber;
      let usdcPrice: BigNumber;
      let daiPrice: BigNumber;

      wrappedETHPrice = ether(128);
      wrappedBTCPrice = ether(7500);
      usdcPrice = ether(1);
      daiPrice = ether(1);

      usdWrappedETHOracle = await oracleHelper.deployUpdatableOracleMockAsync(wrappedETHPrice);
      usdWrappedBTCOracle = await oracleHelper.deployUpdatableOracleMockAsync(wrappedBTCPrice);
      usdUSDCOracle = await oracleHelper.deployUpdatableOracleMockAsync(usdcPrice);
      usdDaiOracle = await oracleHelper.deployUpdatableOracleMockAsync(daiPrice);

      usdOracleWhiteList = await coreHelper.deployOracleWhiteListAsync(
        [wrappedETH.address, wrappedBTC.address, usdc.address, dai.address],
        [usdWrappedETHOracle.address, usdWrappedBTCOracle.address, usdUSDCOracle.address, usdDaiOracle.address],
      );

      ethWrappedETHOracle = await oracleHelper.deployUpdatableOracleMockAsync(
        wrappedETHPrice.mul(ether(1)).div(wrappedETHPrice).round(0, 3)
      );
      ethWrappedBTCOracle = await oracleHelper.deployUpdatableOracleMockAsync(
        wrappedBTCPrice.mul(ether(1)).div(wrappedETHPrice).round(0, 3)
      );
      ethUSDCOracle = await oracleHelper.deployUpdatableOracleMockAsync(
        usdcPrice.mul(ether(1)).div(wrappedETHPrice).round(0, 3)
      );
      ethDaiOracle = await oracleHelper.deployUpdatableOracleMockAsync(
        daiPrice.mul(ether(1)).div(wrappedETHPrice).round(0, 3)
      );

      ethOracleWhiteList = await coreHelper.deployOracleWhiteListAsync(
        [wrappedETH.address, wrappedBTC.address, usdc.address, dai.address],
        [ethWrappedETHOracle.address, ethWrappedBTCOracle.address, ethUSDCOracle.address, ethDaiOracle.address],
      );

      const maxProfitFeePercentage = ether(.5);
      const maxStreamingFeePercentage = ether(.1);
      ethPerformanceFeeCalculator = await feeCalculatorHelper.deployPerformanceFeeCalculatorAsync(
        coreMock.address,
        ethOracleWhiteList.address,
        maxProfitFeePercentage,
        maxStreamingFeePercentage
      );
      await coreHelper.addAddressToWhiteList(ethPerformanceFeeCalculator.address, feeCalculatorWhitelist);

      const collateralSetComponents = [wrappedETH.address, wrappedBTC.address];
      const collateralSetUnits = [wrappedBTCPrice.div(wrappedETHPrice).mul(10 ** 12), new BigNumber(100)];
      const collateralSetNaturalUnit = new BigNumber(10 ** 12);
      collateralSet = await coreHelper.createSetTokenAsync(
        coreMock,
        setTokenFactory.address,
        collateralSetComponents,
        collateralSetUnits,
        collateralSetNaturalUnit,
      );

      const calculatorData = feeCalculatorHelper.generatePerformanceFeeCallDataBuffer(
        ONE_DAY_IN_SECONDS.mul(30),
        ONE_YEAR_IN_SECONDS,
        ether(.2),
        ether(.02)
      );

      const firstNaturalUnit = new BigNumber(10 ** 8);
      const firstSetValue = await valuationHelper.calculateSetTokenValueAsync(collateralSet, usdOracleWhiteList);
      const firstSetUnits = new BigNumber(100).mul(firstNaturalUnit).mul(10 ** 18).div(firstSetValue).round(0, 3);
      const firstSetCallData = rebalancingSetV3Helper.generateRebalancingSetTokenV3CallData(
        deployerAccount,
        liquidator.address,
        deployerAccount,
        ethPerformanceFeeCalculator.address,
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS.mul(2),
        ZERO,
        ZERO,
        calculatorData
      );

      rebalancingSetToken = await rebalancingSetV3Helper.createRebalancingTokenV3Async(
        coreMock,
        rebalancingSetTokenV3Factory.address,
        [collateralSet.address],
        [firstSetUnits],
        firstNaturalUnit,
        firstSetCallData
      );

      usdPerformanceFeeCalculator = await feeCalculatorHelper.deployPerformanceFeeCalculatorAsync(
        coreMock.address,
        usdOracleWhiteList.address,
        maxProfitFeePercentage,
        maxStreamingFeePercentage
      );
      await coreHelper.addAddressToWhiteList(usdPerformanceFeeCalculator.address, feeCalculatorWhitelist);

      const secondNaturalUnit = new BigNumber(10 ** 8);
      const secondSetValue = await valuationHelper.calculateSetTokenValueAsync(collateralSet, usdOracleWhiteList);
      const secondSetUnits = new BigNumber(100).mul(secondNaturalUnit).mul(10 ** 18).div(secondSetValue).round(0, 3);
      const secondSetCallData = rebalancingSetV3Helper.generateRebalancingSetTokenV3CallData(
        deployerAccount,
        liquidator.address,
        deployerAccount,
        usdPerformanceFeeCalculator.address,
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS.mul(2),
        ZERO,
        ZERO,
        calculatorData
      );

      secondRebalancingSetToken = await rebalancingSetV3Helper.createRebalancingTokenV3Async(
        coreMock,
        rebalancingSetTokenV3Factory.address,
        [collateralSet.address],
        [secondSetUnits],
        secondNaturalUnit,
        secondSetCallData
      );

      subjectTradingPools = [rebalancingSetToken.address, secondRebalancingSetToken.address];
    });

    async function subject(): Promise<any> {
      return poolViewer.batchFetchTradingPoolFeeState.callAsync(
        subjectTradingPools
      );
    }

    it('fetches the correct rebalanceFee array', async () => {
      const tradingPoolFeeStates = await subject();

      const firstFeeState: any = await ethPerformanceFeeCalculator.feeState.callAsync(rebalancingSetToken.address);
      const secondFeeState: any = await usdPerformanceFeeCalculator.feeState.callAsync(
        secondRebalancingSetToken.address
      );
      
      const expectedFeeStateInfo = _.map([firstFeeState, secondFeeState], feeStates =>
        [
          feeStates.profitFeePeriod,
          feeStates.highWatermarkResetPeriod,
          feeStates.profitFeePercentage,
          feeStates.streamingFeePercentage,
          feeStates.highWatermark,
          feeStates.lastProfitFeeTimestamp,
          feeStates.lastStreamingFeeTimestamp,
        ]
      );

      expect(JSON.stringify(tradingPoolFeeStates)).to.equal(JSON.stringify(expectedFeeStateInfo));
    });
  });
});
