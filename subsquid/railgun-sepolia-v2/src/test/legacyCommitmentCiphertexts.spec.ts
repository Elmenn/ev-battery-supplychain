import compareResults from "./common/compareHelper";

const payload_first = (count: number, offset: number) => {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
        legacyCommitmentCiphertextsConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
        edges {
          node {
            ephemeralKeys
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
        legacyCommitmentCiphertexts(first: ${count}, where: {id_gt: "${lastId}"}) {
          ephemeralKeys
          id
          memo
          ciphertext {
            data
            id
            iv
            tag
          }
      }
    }`,
    extensions: {},
  };
};

compareResults("LegacyCommitmentCipherTexts", payload_first, payload_second, [
  "legacyCommitmentCiphertextsConnection",
  "legacyCommitmentCiphertexts",
]);
