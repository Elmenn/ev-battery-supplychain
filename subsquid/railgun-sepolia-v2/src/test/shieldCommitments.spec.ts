import compareResults from "./common/compareHelper";

const payload_first = (count: number, offset: number) => {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
        shieldCommitmentsConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
        edges {
          node {
            batchStartTreePosition
        blockNumber
        blockTimestamp
        commitmentType
        encryptedBundle
        fee
        hash
        id
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
      shieldCommitments(first: ${count}, where: {id_gt: "${lastId}"}) {
        batchStartTreePosition
        blockNumber
        blockTimestamp
        commitmentType
        encryptedBundle
        fee
        hash
        id
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
    }`,
    extensions: {},
  };
};

compareResults(
  "ShieldCommitments",
  payload_first,
  payload_second,
  ["shieldCommitmentsConnection", "shieldCommitments"]
  //   true,
  //   1
);
