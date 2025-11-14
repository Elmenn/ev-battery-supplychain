import compareResults from "./common/compareHelper";

const payload_first = (count: number, offset: number) => {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
      nullifiersConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
        edges {
          node {
            blockNumber
            blockTimestamp
            id
            nullifier
            transactionHash
            treeNumber
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`,
    variables: null,
  };
};
const payload_second = (count: number, lastId: string) => {
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
      nullifiers(orderBy: id, orderDirection: asc, first: ${count}, where: {id_gt: "${lastId}"}) {
        blockNumber
        blockTimestamp
        id
        nullifier
        transactionHash
        treeNumber
      }
    }`,
    extensions: {},
  };
};

compareResults("Nullifiers", payload_first, payload_second, [
  "nullifiersConnection",
  "nullifiers",
]);

/* import PostFunction from "./common";
var assert = require("assert");

function Query_GetDataSQD(count: number, offset: number) {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;

  return `query MyQuery {
    nullifiersConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
      edges {
        node {
          blockNumber
          blockTimestamp
          id
          nullifier
          transactionHash
          treeNumber
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }`;
}

async function getActualData(
  request: PostFunction,
  count: number,
  offset: number
) {
  const query = Query_GetDataSQD(count, offset);
  const { data } = await request.getData({
    query,
    variables: null,
  });

  const { pageInfo, edges } = data.data.nullifiersConnection;
  // console.log({ edges: edges[0].node });
  return {
    pageInfo,
    nullifiers: edges.map((edge: any) => edge.node),
  };
}

function Query_GetDataSubgraph(count: number, lastId: string) {
  return `query MyQuery {
    nullifiers(orderBy: id, orderDirection: asc, first: ${count}, where: {id_gt: "${lastId}"}) {
      blockNumber
      blockTimestamp
      id
      nullifier
      transactionHash
      treeNumber
    }
  }`;
}

async function getExpectedData(
  request: PostFunction,
  count: number,
  lastId: string
) {
  const query = Query_GetDataSubgraph(count, lastId);
  const { data } = await request.getData({
    query,
  });

  const last = data.data.nullifiers.length - 1;
  return {
    lastId: data.data.nullifiers[last].id,
    nullifiers: data.data.nullifiers,
  };
}

describe("Nullifiers", async function () {
  this.timeout(4_000_000);
  it("Compare Nullifiers Sorted By ID", async function () {
    const request = new PostFunction();
    let offset = 0;
    let count = 999;
    let hasNextPage = true;
    let lastId = "";
    let totalData = 0;
    while (hasNextPage) {
      const [actual, expected] = await Promise.all([
        getActualData(request, count, offset),
        getExpectedData(request, count, lastId),
      ]);
      assert.equal(
        JSON.stringify(actual.nullifiers),
        JSON.stringify(expected.nullifiers)
      );
      totalData += actual.nullifiers.length;
      console.log(`Compared ${totalData}`);

      offset += count;
      lastId = expected.lastId;
      hasNextPage = actual.pageInfo.hasNextPage;
    }
  });
}); */
