import compareResults from "./common/compareHelper";

const payload_first = (count: number, offset: number) => {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
      unshieldsConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
        edges {
          node {
            amount
        blockNumber
        blockTimestamp
        eventLogIndex
        fee
        id
        to
        transactionHash
        token {
            tokenType
            tokenSubID
            tokenAddress
            id
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
      unshields(first: ${count}, where: {id_gt: "${lastId}"}) {
        amount
        blockNumber
        blockTimestamp
        eventLogIndex
        fee
        id
        to
        transactionHash
        token {
            tokenType
            tokenSubID
            tokenAddress
            id
          }
      }
    }`,
    extensions: {},
  };
};

compareResults("Unshields", payload_first, payload_second, [
  "unshieldsConnection",
  "unshields",
]);
