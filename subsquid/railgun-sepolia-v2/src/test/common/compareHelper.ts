import PostFunction from "./index";
var assert = require("assert");

const compareResults = async (
  name: string,
  payload_first: any,
  payload_second: any,
  method: any,
  testForSpecifiCode: boolean = false,
  totalCount: number = 999
) => {
  const request = new PostFunction();
  let offset = 0;
  let count = totalCount;
  let hasNextPage = true;
  let lastId = "";
  let totalData = 0;

  (testForSpecifiCode ? describe.only : describe)(name, function () {
    this.timeout(4_000_000);
    it(`compare ${name} sorted by id`, async function () {
      while (hasNextPage) {
        const [actual, expected] = await Promise.all([
          request.getData(payload_first(count, offset)),
          request.getData(payload_second(count, lastId)),
        ]);
        const actualTokensConnectionResp =
          actual?.data?.data?.[method[0]] || actual?.data?.data?.[method[1]];
        const expectedTokens =
          expected?.data?.data?.[method[1]] ||
          expected?.data?.data?.[method[0]];
        hasNextPage = actualTokensConnectionResp?.pageInfo?.hasNextPage;

        const finalActualData = actualTokensConnectionResp.edges.map(
          (x: any) => x.node
        );

        assert.equal(
          JSON.stringify(finalActualData),
          JSON.stringify(expectedTokens)
        );
        offset += count;
        lastId = expectedTokens?.[expectedTokens?.length - 1]?.id;
        totalData += actualTokensConnectionResp?.edges?.length;
        console.log(`Compared ${totalData}`);
      }
    });
  });
};

export default compareResults;
