import * as smoldot from "https://deno.land/x/smoldot2/index-deno.js";
import { z } from "https://deno.land/x/zod/mod.ts";
import { deferred } from "https://raw.githubusercontent.com/denoland/deno_std/main/async/deferred.ts";

const jsonRpcBaseSpec = z.object({
  jsonrpc: z.literal("2.0"),
});

const jsonRpcPlainSpec = z.intersection(
  jsonRpcBaseSpec,
  z.object({
    id: z.number(),
    result: z.string(),
  })
);

const chainHeadUnstableFollowEventFinalized = z.intersection(
  jsonRpcBaseSpec,
  z.object({
    method: z.literal("chainHead_unstable_followEvent"),
    params: z.object({
      subscription: z.string(),
      result: z.object({
        event: z.literal("finalized"),
        finalizedBlockHashes: z.array(z.string()),
      }),
    }),
  })
);

const chainSpec = Deno.readTextFileSync("./polkadot.json");

const client = smoldot.start({});

const chain = await client.addChain({ chainSpec });

let id = 1;

const eventsStorageKey =
  "0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7";

chain.sendJsonRpc(
  `{"jsonrpc":"2.0","id":${id++},"method":"chainHead_unstable_follow","params":[true]}`
);

const resp = await chain.nextJsonRpcResponse();
const { result: subscriptionId } = jsonRpcPlainSpec.parse(JSON.parse(resp));

const finalizedBlockHash = deferred<string>();
(async () => {
  while (true) {
    const resp = await chain.nextJsonRpcResponse();
    /* console.log(resp); */
    const parsed = chainHeadUnstableFollowEventFinalized.safeParse(
      JSON.parse(resp)
    );
    /* type A = z.ZodType<typeof chainHeadUnstableFollowEventFinalized> */
    if (parsed.success) {
      finalizedBlockHash.resolve(
        parsed.data.params.result.finalizedBlockHashes[0]
      );
      break;
    }
  }
})();

const storageParams = [
  subscriptionId,
  await finalizedBlockHash,
  [{ key: eventsStorageKey, type: "value" }],
  null,
];

chain.sendJsonRpc(
  `{"jsonrpc":"2.0","id":${id++},"method":"chainHead_unstable_storage","params": ${JSON.stringify(
    storageParams
  )}}`
);

(async () => {
  while (true) {
    const resp = await chain.nextJsonRpcResponse();
    console.log(resp);
  }
})();
