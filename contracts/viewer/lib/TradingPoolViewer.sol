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

import { ISocialTradingManager } from "set-protocol-strategies/contracts/managers/interfaces/ISocialTradingManager.sol";
import { SocialTradingLibrary } from "set-protocol-strategies/contracts/managers/lib/SocialTradingLibrary.sol";

import { IPerformanceFeeCalculator } from "set-protocol-contracts/contracts/core/interfaces/IPerformanceFeeCalculator.sol";
import { IRebalancingSetTokenV2 } from "set-protocol-contracts/contracts/core/interfaces/IRebalancingSetTokenV2.sol";
import { IRebalancingSetTokenV3 } from "set-protocol-contracts/contracts/core/interfaces/IRebalancingSetTokenV3.sol";
import { PerformanceFeeLibrary } from "set-protocol-contracts/contracts/core/fee-calculators/lib/PerformanceFeeLibrary.sol";

import { RebalancingSetTokenViewer } from "./RebalancingSetTokenViewer.sol";


/**
 * @title TradingPoolViewer
 * @author Set Protocol
 *
 * Interfaces for fetching multiple TradingPool state in a single read. Includes state
 * specific to managing pool as well as underlying RebalancingSetTokenV2 state.
 */
contract TradingPoolViewer is RebalancingSetTokenViewer {

    /*
     * Fetches TradingPool details. Compatible with:
     * - RebalancingSetTokenV2/V3
     * - Any Fee Calculator
     * - Any Liquidator
     *
     * @param  _rebalancingSetToken           RebalancingSetToken contract instance
     * @return RebalancingLibrary.State       Current rebalance state on the RebalancingSetToken
     * @return uint256[]                      Starting current set, start time, minimum bid, and remaining current sets
     */
    function fetchNewTradingPoolDetails(
        IRebalancingSetTokenV2 _tradingPool
    )
        external
        view
        returns (SocialTradingLibrary.PoolInfo memory, RebalancingSetCreateInfo memory, CollateralSetInfo memory)
    {
        RebalancingSetCreateInfo memory tradingPoolInfo = getRebalancingSetInfo(
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

    /*
     * Fetches TradingPoolV2 details. Compatible with:
     * - RebalancingSetTokenV2/V3
     * - PerformanceFeeCalculator
     * - Any Liquidator
     *
     * @param  _rebalancingSetToken           RebalancingSetToken contract instance
     * @return RebalancingLibrary.State       Current rebalance state on the RebalancingSetToken
     * @return uint256[]                      Starting current set, start time, minimum bid, and remaining current sets
     */
    function fetchNewTradingPoolV2Details(
        IRebalancingSetTokenV3 _tradingPool
    )
        external
        view
        returns (
            SocialTradingLibrary.PoolInfo memory,
            RebalancingSetCreateInfo memory,
            PerformanceFeeLibrary.FeeState memory,
            CollateralSetInfo memory,
            address
        )
    {
        (
            RebalancingSetCreateInfo memory tradingPoolInfo,
            PerformanceFeeLibrary.FeeState memory performanceFeeInfo,
            CollateralSetInfo memory collateralSetInfo,
            address performanceFeeCalculatorAddress
        ) = fetchNewRebalancingSetDetails(_tradingPool);

        SocialTradingLibrary.PoolInfo memory poolInfo = ISocialTradingManager(tradingPoolInfo.manager).pools(
            address(_tradingPool)
        );

        return (poolInfo, tradingPoolInfo, performanceFeeInfo, collateralSetInfo, performanceFeeCalculatorAddress);
    }

    /*
     * Fetches all TradingPool state associated with a new rebalance auction. Compatible with:
     * - RebalancingSetTokenV2/V3
     * - Any Fee Calculator
     * - Any liquidator (will omit additional TWAPLiquidator state)
     *
     * @param  _rebalancingSetToken           RebalancingSetToken contract instance
     * @return RebalancingLibrary.State       Current rebalance state on the RebalancingSetToken
     * @return uint256[]                      Starting current set, start time, minimum bid, and remaining current sets
     */
    function fetchTradingPoolRebalanceDetails(
        IRebalancingSetTokenV2 _tradingPool
    )
        external
        view
        returns (SocialTradingLibrary.PoolInfo memory, RebalancingSetRebalanceInfo memory, CollateralSetInfo memory)
    {
        (
            RebalancingSetRebalanceInfo memory tradingPoolInfo,
            CollateralSetInfo memory collateralSetInfo
        ) = fetchRBSetRebalanceDetails(_tradingPool);

        address manager = _tradingPool.manager();

        SocialTradingLibrary.PoolInfo memory poolInfo = ISocialTradingManager(manager).pools(
            address(_tradingPool)
        );

        return (poolInfo, tradingPoolInfo, collateralSetInfo);
    }

    /*
     * Fetches all TradingPool state associated with a new TWAP rebalance auction. Compatible with:
     * - RebalancingSetTokenV2/V3
     * - Any Fee Calculator
     * - TWAP Liquidator
     *
     * @param  _rebalancingSetToken           RebalancingSetToken contract instance
     * @return RebalancingLibrary.State       Current rebalance state on the RebalancingSetToken
     * @return uint256[]                      Starting current set, start time, minimum bid, and remaining current sets
     */
    function fetchTradingPoolTWAPRebalanceDetails(
        IRebalancingSetTokenV2 _tradingPool
    )
        external
        view
        returns (SocialTradingLibrary.PoolInfo memory, TWAPRebalanceInfo memory, CollateralSetInfo memory)
    {
        (
            TWAPRebalanceInfo memory tradingPoolInfo,
            CollateralSetInfo memory collateralSetInfo
        ) = fetchRBSetTWAPRebalanceDetails(_tradingPool);

        address manager = _tradingPool.manager();

        SocialTradingLibrary.PoolInfo memory poolInfo = ISocialTradingManager(manager).pools(
            address(_tradingPool)
        );

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
}
