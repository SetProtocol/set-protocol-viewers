/*
    Copyright 2019 Set Labs Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

pragma solidity 0.5.7;
pragma experimental "ABIEncoderV2";

import { ERC20Detailed } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";

import { ISocialTradingManager } from "set-protocol-strategies/contracts/managers/interfaces/ISocialTradingManager.sol";
import { SocialTradingLibrary } from "set-protocol-strategies/contracts/managers/lib/SocialTradingLibrary.sol";

import { IFeeCalculator } from "set-protocol-contracts/contracts/core/interfaces/IFeeCalculator.sol";
import { ILiquidator } from "set-protocol-contracts/contracts/core/interfaces/ILiquidator.sol";
import { IPerformanceFeeCalculator } from "set-protocol-contracts/contracts/core/interfaces/IPerformanceFeeCalculator.sol";
import { IRebalancingSetTokenV2 } from "set-protocol-contracts/contracts/core/interfaces/IRebalancingSetTokenV2.sol";
import { IRebalancingSetTokenV3 } from "set-protocol-contracts/contracts/core/interfaces/IRebalancingSetTokenV3.sol";
import { ISetToken } from "set-protocol-contracts/contracts/core/interfaces/ISetToken.sol";
import { PerformanceFeeLibrary } from "set-protocol-contracts/contracts/core/fee-calculators/lib/PerformanceFeeLibrary.sol";
import { RebalancingLibrary } from "set-protocol-contracts/contracts/core/lib/RebalancingLibrary.sol";


/**
 * @title TradingPoolViewer
 * @author Set Protocol
 *
 * Interfaces for fetching multiple TradingPool state in a single read. Includes state
 * specific to managing pool as well as underlying RebalancingSetTokenV2 state.
 */
contract TradingPoolViewer {

    struct TradingPoolCreateInfo {
        address manager;
        address feeRecipient;
        ISetToken currentSet;
        uint256 unitShares;
        uint256 naturalUnit;
        uint256 rebalanceInterval;
        uint256 entryFee;
        uint256 rebalanceFee;
        uint256 lastRebalanceTimestamp;
        RebalancingLibrary.State rebalanceState;
        string name;
        string symbol;
    }

    struct TradingPoolRebalanceInfo {
        uint256 rebalanceStartTime;
        uint256 timeToPivot;
        uint256 startPrice;
        uint256 endPrice;
        uint256 startingCurrentSets;
        uint256 remainingCurrentSets;
        uint256 minimumBid;
        RebalancingLibrary.State rebalanceState;
        ISetToken nextSet;
        ILiquidator liquidator;
    }

    struct CollateralSetInfo {
        address[] components;
        uint256[] units;
        uint256 naturalUnit;
        string name;
        string symbol;    
    }

    function fetchNewTradingPoolDetails(
        IRebalancingSetTokenV2 _tradingPool
    )
        external
        view
        returns (SocialTradingLibrary.PoolInfo memory, TradingPoolCreateInfo memory, CollateralSetInfo memory)
    {
        TradingPoolCreateInfo memory tradingPoolInfo = getTradingPoolInfo(
            address(_tradingPool)
        );

        SocialTradingLibrary.PoolInfo memory poolInfo = ISocialTradingManager(tradingPoolInfo.manager).pools(
            address(_tradingPool)
        );

        CollateralSetInfo memory collateralSetInfo = getCollateralSetInfo(
            tradingPoolInfo.currentSet
        );

        return (poolInfo, tradingPoolInfo, collateralSetInfo);
    }

    function fetchNewTradingPoolV2Details(
        IRebalancingSetTokenV3 _tradingPool
    )
        external
        view
        returns (
            SocialTradingLibrary.PoolInfo memory,
            TradingPoolCreateInfo memory,
            PerformanceFeeLibrary.FeeState memory,
            CollateralSetInfo memory,
            address
        )
    {
        TradingPoolCreateInfo memory tradingPoolInfo = getTradingPoolInfo(
            address(_tradingPool)
        );

        SocialTradingLibrary.PoolInfo memory poolInfo = ISocialTradingManager(tradingPoolInfo.manager).pools(
            address(_tradingPool)
        );

        PerformanceFeeLibrary.FeeState memory performanceFeeInfo = getPerformanceFeeState(
            address(_tradingPool)
        );

        CollateralSetInfo memory collateralSetInfo = getCollateralSetInfo(
            tradingPoolInfo.currentSet
        );

        address performanceFeeCalculatorAddress = address(_tradingPool.rebalanceFeeCalculator());

        return (poolInfo, tradingPoolInfo, performanceFeeInfo, collateralSetInfo, performanceFeeCalculatorAddress);
    }

    function fetchTradingPoolRebalanceDetails(
        IRebalancingSetTokenV2 _tradingPool
    )
        external
        view
        returns (SocialTradingLibrary.PoolInfo memory, TradingPoolRebalanceInfo memory, CollateralSetInfo memory)
    {
        uint256[] memory auctionParams = _tradingPool.getAuctionPriceParameters();
        uint256[] memory biddingParams = _tradingPool.getBiddingParameters();

        TradingPoolRebalanceInfo memory tradingPoolInfo = TradingPoolRebalanceInfo({
            rebalanceStartTime: auctionParams[0],
            timeToPivot: auctionParams[1],
            startPrice: auctionParams[2],
            endPrice: auctionParams[3],
            startingCurrentSets: _tradingPool.startingCurrentSetAmount(), 
            remainingCurrentSets: biddingParams[1],
            minimumBid: biddingParams[0],
            rebalanceState: _tradingPool.rebalanceState(),
            nextSet: _tradingPool.nextSet(),
            liquidator: _tradingPool.liquidator()
        });

        address manager = _tradingPool.manager();

        SocialTradingLibrary.PoolInfo memory poolInfo = ISocialTradingManager(manager).pools(
            address(_tradingPool)
        );

        CollateralSetInfo memory collateralSetInfo = getCollateralSetInfo(_tradingPool.nextSet());

        return (poolInfo, tradingPoolInfo, collateralSetInfo);
    }

    function batchFetchTradingPoolOperator(
        IRebalancingSetTokenV2[] calldata _tradingPools
    )
        external
        view
        returns (address[] memory)
    {
        // Cache length of addresses to fetch owner for
        uint256 _poolCount = _tradingPools.length;
        
        // Instantiate output array in memory
        address[] memory operators = new address[](_poolCount);

        for (uint256 i = 0; i < _poolCount; i++) {
            IRebalancingSetTokenV2 tradingPool = _tradingPools[i];

            operators[i] = ISocialTradingManager(tradingPool.manager()).pools(
                address(tradingPool)
            ).trader;
        }

        return operators;
    }

    function batchFetchTradingPoolEntryFees(
        IRebalancingSetTokenV2[] calldata _tradingPools
    )
        external
        view
        returns (uint256[] memory)
    {
        // Cache length of addresses to fetch entryFees for
        uint256 _poolCount = _tradingPools.length;
        
        // Instantiate output array in memory
        uint256[] memory entryFees = new uint256[](_poolCount);

        for (uint256 i = 0; i < _poolCount; i++) {
            entryFees[i] = _tradingPools[i].entryFee();
        }

        return entryFees;
    }

    function batchFetchTradingPoolRebalanceFees(
        IRebalancingSetTokenV2[] calldata _tradingPools
    )
        external
        view
        returns (uint256[] memory)
    {
        // Cache length of addresses to fetch rebalanceFees for
        uint256 _poolCount = _tradingPools.length;
        
        // Instantiate output array in memory
        uint256[] memory rebalanceFees = new uint256[](_poolCount);

        for (uint256 i = 0; i < _poolCount; i++) {
            rebalanceFees[i] = _tradingPools[i].rebalanceFee();
        }

        return rebalanceFees;
    }

    function batchFetchTradingPoolAccumulation(
        IRebalancingSetTokenV3[] calldata _tradingPools
    )
        external
        view
        returns (uint256[] memory, uint256[] memory)
    {
        // Cache length of addresses to fetch rebalanceFees for
        uint256 _poolCount = _tradingPools.length;
        
        // Instantiate streaming fees output array in memory
        uint256[] memory streamingFees = new uint256[](_poolCount);

        // Instantiate profit fees output array in memory
        uint256[] memory profitFees = new uint256[](_poolCount);

        for (uint256 i = 0; i < _poolCount; i++) {
            address rebalanceFeeCalculatorAddress = address(_tradingPools[i].rebalanceFeeCalculator());
            
            (
                streamingFees[i],
                profitFees[i]
            ) = IPerformanceFeeCalculator(rebalanceFeeCalculatorAddress).getCalculatedFees(
                address(_tradingPools[i])
            );
        }

        return (streamingFees, profitFees);
    }


    function batchFetchTradingPoolFeeState(
        IRebalancingSetTokenV3[] calldata _tradingPools
    )
        external
        view
        returns (PerformanceFeeLibrary.FeeState[] memory)
    {
        // Cache length of addresses to fetch rebalanceFees for
        uint256 _poolCount = _tradingPools.length;
        
        // Instantiate output array in memory
        PerformanceFeeLibrary.FeeState[] memory feeStates = new PerformanceFeeLibrary.FeeState[](_poolCount);

        for (uint256 i = 0; i < _poolCount; i++) {
            feeStates[i] = getPerformanceFeeState(
                address(_tradingPools[i])
            );
        }

        return feeStates;
    }

    /* ============ Internal Functions ============ */

    function getCollateralSetInfo(
        ISetToken _collateralSet
    )
        internal
        view
        returns (CollateralSetInfo memory)
    {
        return CollateralSetInfo({
            components: _collateralSet.getComponents(),
            units: _collateralSet.getUnits(),
            naturalUnit: _collateralSet.naturalUnit(),
            name: ERC20Detailed(address(_collateralSet)).name(),
            symbol: ERC20Detailed(address(_collateralSet)).symbol()
        });
    }

    function getTradingPoolInfo(
        address _tradingPool
    )
        internal
        view
        returns (TradingPoolCreateInfo memory)
    {
        IRebalancingSetTokenV2 rebalancingSetTokenV2Instance = IRebalancingSetTokenV2(_tradingPool);

        return TradingPoolCreateInfo({
            manager: rebalancingSetTokenV2Instance.manager(),
            feeRecipient: rebalancingSetTokenV2Instance.feeRecipient(),
            currentSet: rebalancingSetTokenV2Instance.currentSet(),
            unitShares: rebalancingSetTokenV2Instance.unitShares(),
            naturalUnit: rebalancingSetTokenV2Instance.naturalUnit(),
            rebalanceInterval: rebalancingSetTokenV2Instance.rebalanceInterval(),
            entryFee: rebalancingSetTokenV2Instance.entryFee(),
            rebalanceFee: rebalancingSetTokenV2Instance.rebalanceFee(),
            lastRebalanceTimestamp: rebalancingSetTokenV2Instance.lastRebalanceTimestamp(),
            rebalanceState: rebalancingSetTokenV2Instance.rebalanceState(),
            name: rebalancingSetTokenV2Instance.name(),
            symbol: rebalancingSetTokenV2Instance.symbol()
        });
    }

    function getPerformanceFeeState(
        address _tradingPool
    )
        internal
        view
        returns (PerformanceFeeLibrary.FeeState memory)
    {
        IRebalancingSetTokenV3 rebalancingSetTokenV3Instance = IRebalancingSetTokenV3(_tradingPool);

        address rebalanceFeeCalculatorAddress = address(rebalancingSetTokenV3Instance.rebalanceFeeCalculator());
        return IPerformanceFeeCalculator(rebalanceFeeCalculatorAddress).feeState(_tradingPool);
    }
}
