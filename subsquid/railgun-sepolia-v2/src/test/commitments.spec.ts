import compareResults from "./common/compareHelper";

const payload_first = (count: number, offset: number) => {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
        commitmentsConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
        edges {
          node {
            batchStartTreePosition,
            blockNumber
            blockTimestamp
            commitmentType
            hash
            id
            transactionHash
            treeNumber
            treePosition
            treeNumber
    ... on LegacyEncryptedCommitment {
      id
      batchStartTreePosition
      blockTimestamp
      blockNumber
      commitmentType
      hash
      transactionHash
      treeNumber
      treePosition
    }
    ... on LegacyGeneratedCommitment {
      id
      batchStartTreePosition
      blockNumber
      blockTimestamp
      commitmentType
      encryptedRandom
      hash
      transactionHash
      treeNumber
      treePosition
      preimage {
        id
        npk
        value
        token {
          id
          tokenAddress
          tokenSubID
          tokenType
        }
      }
    }
    ... on ShieldCommitment {
      id
      batchStartTreePosition
      blockNumber
      blockTimestamp
      commitmentType
      encryptedBundle
      fee
      hash
      shieldKey
      transactionHash
      treeNumber
      treePosition
      preimage {
        id
        npk
        value
        token {
          id
          tokenAddress
          tokenSubID
          tokenType
        }
      }
    }
    ... on TransactCommitment {
      id
      batchStartTreePosition
      blockNumber
      blockTimestamp
      commitmentType
      hash
      transactionHash
      treeNumber
      treePosition
      ciphertext {
        annotationData
        blindedReceiverViewingKey
        blindedSenderViewingKey
        id
        memo
        ciphertext {
          data
          id
          iv
          tag
        }
      }
    }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
    `,
    variables: null,
  };
};
const payload_second = (count: number, lastId: string) => {
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
        commitments(first: ${count},where: {id_gt: "${lastId}"}) {
          batchStartTreePosition,
          blockNumber
          blockTimestamp
          commitmentType
          hash
          id
          transactionHash
          treeNumber
          treePosition
          treeNumber
    ... on LegacyEncryptedCommitment {
      id
      batchStartTreePosition
      blockTimestamp
      blockNumber
      commitmentType
      hash
      transactionHash
      treeNumber
      treePosition
    }
    ... on LegacyGeneratedCommitment {
      id
      batchStartTreePosition
      blockNumber
      blockTimestamp
      commitmentType
      encryptedRandom
      hash
      transactionHash
      treeNumber
      treePosition
      preimage {
        id
        npk
        value
        token {
          id
          tokenAddress
          tokenSubID
          tokenType
        }
      }
    }
    ... on ShieldCommitment {
      id
      batchStartTreePosition
      blockNumber
      blockTimestamp
      commitmentType
      encryptedBundle
      fee
      hash
      shieldKey
      transactionHash
      treeNumber
      treePosition
      preimage {
        id
        npk
        value
        token {
          id
          tokenAddress
          tokenSubID
          tokenType
        }
      }
    }
    ... on TransactCommitment {
      id
      batchStartTreePosition
      blockNumber
      blockTimestamp
      commitmentType
      hash
      transactionHash
      treeNumber
      treePosition
      ciphertext {
        annotationData
        blindedReceiverViewingKey
        blindedSenderViewingKey
        id
        memo
        ciphertext {
          data
          id
          iv
          tag
        }
      }
    }
      }
    }`,
    extensions: {},
  };
};

compareResults(
  "Commitments",
  payload_first,
  payload_second,
  ["commitmentsConnection", "commitments"]
  // true
  // 1
);
