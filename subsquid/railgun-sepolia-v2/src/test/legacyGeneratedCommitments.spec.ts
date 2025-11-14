import compareResults from "./common/compareHelper";

const payload_first = (count: number, offset: number) => {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
        legacyGeneratedCommitmentsConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
        edges {
          node {
            hash
            blockNumber
        blockTimestamp
        commitmentType
        encryptedRandom
        id
        transactionHash
        treeNumber
        treePosition
        batchStartTreePosition
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
      legacyGeneratedCommitments(first: ${count}, where: {id_gt: "${lastId}"}) {
        hash
        blockNumber
        blockTimestamp
        commitmentType
        encryptedRandom
        id
        transactionHash
        treeNumber
        treePosition
        batchStartTreePosition
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
    }`,
    extensions: {},
  };
};

compareResults(
  "LegacyGeneratedCommitmentsConnection",
  payload_first,
  payload_second,
  ["legacyGeneratedCommitmentsConnection", "legacyGeneratedCommitments"]
  // true getting error on this
);
