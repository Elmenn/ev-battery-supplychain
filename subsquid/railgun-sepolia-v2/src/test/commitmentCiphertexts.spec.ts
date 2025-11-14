import compareResults from "./common/compareHelper";

const payload_first = (count: number, offset: number) => {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
        commitmentCiphertextsConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
        edges {
          node {
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
        commitmentCiphertexts(first: ${count}, where: {id_gt: "${lastId}"}) {
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
    }`,
    extensions: {},
  };
};

compareResults("CommitmentCipherTexts", payload_first, payload_second, [
  "commitmentCiphertextsConnection",
  "commitmentCiphertexts",
]);
