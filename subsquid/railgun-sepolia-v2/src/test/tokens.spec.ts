// const chai = require("chai");
import axios from "axios";
var assert = require("assert");
import fs from "fs";

import PostFunction from "./common";
import compareResults from "./common/compareHelper";

const payload_first = (count: number, offset: number) => {
  const offsetQuery = offset == 0 ? "" : `, after: "${offset}"`;
  return {
    operationName: "MyQuery",
    query: `query MyQuery {
      tokensConnection(orderBy: id_ASC, first: ${count} ${offsetQuery}) {
        edges {
          node {
            id
            tokenSubID
            tokenAddress
            tokenType
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
      tokens(first: ${count}, where: {id_gt: "${lastId}"}) {
        id
        tokenSubID
        tokenAddress
        tokenType
      }
    }`,
    extensions: {},
  };
};

compareResults(
  "Tokens",
  payload_first,
  payload_second,
  ["tokensConnection", "tokens"]
  // true,
  // 1
);
