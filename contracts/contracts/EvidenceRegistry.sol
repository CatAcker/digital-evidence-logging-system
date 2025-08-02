// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./verifier.sol";

contract EvidenceRegistry is Verifier {
    struct Evidence {
        string hash;
        string metadata;
        uint timestamp;
    }

    mapping(address => Evidence[]) public logs;

    // Standard submission (no ZKP)
    function submitEvidence(string memory hash, string memory metadata) public {
        logs[msg.sender].push(Evidence(hash, metadata, block.timestamp));
    }

    // ZKP-validated submission
    function submitEvidenceWithProof(
        string memory hash,
        string memory metadata,
        Proof memory proof,
        uint[] memory input
    ) public {
        require(verify(input, proof) == 0, "Invalid ZK proof");
        logs[msg.sender].push(Evidence(hash, metadata, block.timestamp));
    }

    function getEvidenceCount(address user) public view returns (uint) {
        return logs[user].length;
    }

    function getEvidence(address user, uint index) public view returns (string memory, string memory, uint) {
        Evidence memory e = logs[user][index];
        return (e.hash, e.metadata, e.timestamp);
    }
}
