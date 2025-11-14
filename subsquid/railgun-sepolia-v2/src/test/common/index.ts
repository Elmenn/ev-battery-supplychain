import axios from "axios";

const our_generated_end_point =
  "https://7486ba8d-f0e0-4e5b-ba45-9e64a8ea7219.squids.live/subsquid-railgun-bsc-v2/v/v1/graphql";
const railgun_generated_end_point =
  "https://api.thegraph.com/subgraphs/name/railgun-community/railgun-v2-bsc";

class PostFunction {
  async getData(payload: any) {
    return await axios.post(
      payload.variables === null
        ? our_generated_end_point
        : railgun_generated_end_point,
      payload
    );
  }

  async getTotalCount(payload: any) {
    const data = await axios.post(our_generated_end_point, payload);
    return data?.data?.data?.nullifiers;
  }
}
export default PostFunction;
