import compareResults from "./common/compareHelper";

/* ONLY HASH NOT WORKING */
const payload_first = (count: number, offset: number) => {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
        legacyEncryptedCommitmentsConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
        edges {
          node {
            batchStartTreePosition
        blockNumber
        blockTimestamp
        commitmentType
        hash
        id
        transactionHash
        treeNumber
        treePosition
        ciphertext {
            ciphertext {
              data
              id
              iv
              tag
            }
            ephemeralKeys
            id
            memo
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
        legacyEncryptedCommitments(first: ${count}, where: {id_gt: "${lastId}"}) {
            batchStartTreePosition
            blockNumber
            blockTimestamp
            commitmentType
            hash
            id
            transactionHash
            treeNumber
            treePosition
            ciphertext {
                ciphertext {
                  data
                  id
                  iv
                  tag
                }
                ephemeralKeys
                id
                memo
              }
      }
    }`,
    extensions: {},
  };
};

compareResults(
  "LegacyEncryptedCommitments",
  payload_first,
  payload_second,
  ["legacyEncryptedCommitmentsConnection", "legacyEncryptedCommitments"]
  //   true,
  //   1
);
