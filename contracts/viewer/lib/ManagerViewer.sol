/*
    Copyright 2020 Set Labs Inc.

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

import { IAssetPairManager } from "set-protocol-strategies/contracts/managers/interfaces/IAssetPairManager.sol";
import { IMACOStrategyManagerV2 } from "set-protocol-strategies/contracts/managers/interfaces/IMACOStrategyManagerV2.sol";


/**
 * @title ManagerViewer
 * @author Set Protocol
 *
 * Interfaces for fetching multiple managers state in a single read
 */
contract ManagerViewer {

    function batchFetchMACOManagerV2Crossover(
        IMACOStrategyManagerV2[] calldata _managers
    )
        external
        view
        returns (address[] memory)
    {
        
    }
    
}
