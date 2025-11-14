import compareResults from "./common/compareHelper";

const payload_first = (count: number, offset: number) => {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
        commitmentPreimagesConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
        edges {
          node {
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
        commitmentPreimages(first: ${count}, where: {id_gt: "${lastId}"}) {
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
    }`,
    extensions: {},
  };
};

compareResults("CommitmentPreImages", payload_first, payload_second, [
  "commitmentPreimagesConnection",
  "commitmentPreimages",
]);
