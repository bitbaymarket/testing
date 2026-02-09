// SPDX-License-Identifier: Coinleft Public License for BitBay
pragma solidity = 0.8.4;

contract StakingVote {
    uint256 public constant TOP = 5;
    uint256 public epochLength;
    uint256 public epochStart;
    uint256 public epochOffset;
    uint256 public varlock;
    address public treasury;
    address public minter;
    
    mapping(uint256 => Epoch) public epochs;
    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => uint256) public lastEpoch;

    struct Proposal {
        address proposer;
        uint256 weight;
        bytes[] payload;
    }

    struct Epoch {
        bytes32[TOP] hashes;
        bytes32 winner;
        uint256 weight;
        bool executed;
    }

    event voted(address indexed from, uint256 weight, uint256 epoch, bytes32 hash);
    event confirmEpoch(bytes32 indexed winner);

    constructor(uint256 _epochLength, address _treasury) {
        epochLength = _epochLength; //7200 is the default for the treasury
        treasury = _treasury;
        minter = msg.sender;
        epochStart = block.number;
    }

    function changeMinter(address newminter) public {
        require(msg.sender == minter);
        minter = newminter;
    }

    function changeEpochLength(uint len) public {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        require(len >= 300);
        epochLength = len;
        //Ensure that an epoch change will not overwrite prior data
        epochOffset += (currentEpoch() + 2);
    }

    function lockVariables(uint locktime) external {
        require(msg.sender == minter);
        require(varlock < block.timestamp + 7 days);
        varlock = block.timestamp + locktime;
    }

    function currentEpoch() public view returns (uint256) {
        return epochOffset + (block.number / epochLength);
    }

    function winningWeight(uint256 epoch) external view returns (uint256) {
        return epochs[epoch].weight;
    }

    function winningHash(uint256 epoch) external view returns (bytes32) {
        return epochs[epoch].winner;
    }

    function getProposalPayload(bytes32 hash) external view returns (bytes[] memory) {
        return proposals[hash].payload;
    }

    function getEpochHashes(uint256 epoch) external view returns (bytes32[TOP] memory) {
        return epochs[epoch].hashes;
    }

    function sendVote(address user, uint256 weight, bytes[] calldata votePayload) external returns(bool) {
        require(msg.sender == treasury, "treasury only");
        require(weight > 0, "zero weight");
        uint256 epoch = currentEpoch();
        bytes32 hash = keccak256(abi.encode(votePayload));
        // reset proposal if new epoch
        if (lastEpoch[hash] != epoch) {
            proposals[hash].weight = 0;
            if (proposals[hash].payload.length == 0) {
                for (uint256 i = 0; i < votePayload.length; i++) {
                    proposals[hash].payload.push(votePayload[i]);
                }
                proposals[hash].proposer = user;
            }
            lastEpoch[hash] = epoch;
        }
        proposals[hash].weight += weight;
        emit voted(user, weight, epoch, hash);
        _updateTop(epoch, hash);
        return true;
    }

    function _updateTop(uint256 epoch, bytes32 hash) internal {
        Epoch storage e = epochs[epoch];
        uint256 index;
        uint256 lweight = type(uint256).max;
        uint256 bestWeight;
        bytes32 winner;
        bytes32 hash2;
        uint256 w;
        bool newitem = true;
        for (uint256 i = 0; i < TOP; i++) {
            hash2 = e.hashes[i];
            if (hash2 == hash) {
                newitem = false;
            }
            w = proposals[hash2].weight;
            if (w < lweight) {
                lweight = w;
                index = i;
            }
            if (w > bestWeight) {
                bestWeight = w;
                winner = hash2;
            }
        }
        if (newitem) {
             uint256 currentWeight = proposals[hash].weight;
             if (currentWeight > lweight) {
                 e.hashes[index] = hash;
                 if (currentWeight > bestWeight) {
                     winner = hash;
                     bestWeight = currentWeight;
                 }
             }
        }
        e.winner = winner;
        e.weight = bestWeight;
    }

    //Users should only run proposals they trust. Stakers should automatically vote on some null proposal if nothing is being voted on.
    function confirmVotes(uint256 epoch) external returns (bool) {
        require(epoch + 1 == currentEpoch(), "epoch is outside of range");
        Epoch storage e = epochs[epoch];
        require(!e.executed, "already executed");
        e.executed = true;
        if(e.winner == bytes32(0)) {
            return false;
        }
        _executePayload(proposals[e.winner].payload);
        emit confirmEpoch(e.winner);
        return true;
    }

    //This can run multiple arbitrary calls to any contract
    function _executePayload(bytes[] storage payload) internal {
        uint256 i = 0;
        while (i < payload.length) {
            // function signature (human-readable)
            string memory sig = abi.decode(payload[i], (string));
            i++;
            // target address
            address target = abi.decode(payload[i], (address));
            i++;
            // arguments blob
            bytes memory args = abi.decode(payload[i], (bytes));
            i++;
            // We hash the signature string to get the selector (first 4 bytes)
            (bool ok, ) = target.call(abi.encodePacked(bytes4(keccak256(bytes(sig))), args));
            require(ok, "call failed");
        }
    }
}