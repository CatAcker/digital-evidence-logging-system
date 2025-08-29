// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./verifier.sol";

contract EvidenceRegistry is Verifier {
    struct Evidence {
        bytes32 fileHash;
        bytes32 metaHash;
        uint256 timestamp;
        string  fileUrl;
    }

    event EvidenceSubmitted(
        address indexed submitter,
        bytes32 indexed fileHash,
        bytes32 indexed metaHash,
        string fileUrl,
        uint256 timestamp
    );

    mapping(address => Evidence[]) public logs;

    function submitEvidence(bytes32 fileHash, bytes32 metaHash, string memory fileUrl) public {
        logs[msg.sender].push(Evidence(fileHash, metaHash, block.timestamp, fileUrl));
        emit EvidenceSubmitted(msg.sender, fileHash, metaHash, fileUrl, block.timestamp);
    }

    function submitEvidenceWithProof(
        bytes32 fileHash,
        bytes32 metaHash,
        string memory fileUrl,
        Proof memory proof,
        uint256[] memory input
    ) public {
        require(verify(input, proof) == 0, "Invalid ZK proof");
        logs[msg.sender].push(Evidence(fileHash, metaHash, block.timestamp, fileUrl));
        emit EvidenceSubmitted(msg.sender, fileHash, metaHash, fileUrl, block.timestamp);
    }

    function getEvidenceCount(address user) external view returns (uint256) {
        return logs[user].length;
    }

    function getEvidence(address user, uint256 index)
        external
        view
        returns (bytes32, bytes32, string memory, uint256)
    {
        Evidence memory e = logs[user][index];
        return (e.fileHash, e.metaHash, e.fileUrl, e.timestamp);
    }
}
