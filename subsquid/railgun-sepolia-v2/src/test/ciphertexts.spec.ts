import compareResults from "./common/compareHelper";

const payload_first = (count: number, offset: number) => {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
      ciphertextsConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
        edges {
          node {
            data
            id
            iv
            tag
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
      ciphertexts(first: ${count}, where: {id_gt: "${lastId}"}) {
        data
        id
        iv
        tag
      }
    }`,
    extensions: {},
  };
};

compareResults("Ciphertexts", payload_first, payload_second, [
  "ciphertextsConnection",
  "ciphertexts",
]);
