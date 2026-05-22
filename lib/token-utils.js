const { PublicKey } = require("@solana/web3.js");

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

function associatedTokenAddress(owner, mint, tokenProgramId = TOKEN_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

function parsedTokenBalance(account) {
  return account?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
}

async function associatedTokenBalanceForOwner({ rpc, owner, mint, error }) {
  const ownerKey = new PublicKey(owner);
  const mintKey = new PublicKey(mint);
  const ata = associatedTokenAddress(ownerKey, mintKey);
  const account = await rpc("getAccountInfo", [ata.toBase58(), { encoding: "jsonParsed" }]);
  const balance = account.value?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;

  return {
    configured: true,
    owner,
    mint,
    accountCount: account.value ? 1 : 0,
    balance,
    fallback: "associated-token-account",
    fallbackReason: error?.message || "getTokenAccountsByOwner unavailable"
  };
}

async function tokenBalanceForOwner({ rpc, owner, mint }) {
  if (!owner || !mint) {
    return {
      configured: false,
      owner: owner || "",
      mint: mint || "",
      accountCount: 0,
      balance: 0
    };
  }

  if (process.env.TOKEN_BALANCE_SCAN_ALL_ACCOUNTS !== "true") {
    return await associatedTokenBalanceForOwner({ rpc, owner, mint });
  }

  let accounts;
  try {
    accounts = await rpc("getTokenAccountsByOwner", [
      owner,
      { mint },
      { encoding: "jsonParsed" }
    ]);
  } catch (error) {
    return await associatedTokenBalanceForOwner({ rpc, owner, mint, error });
  }

  const balance = accounts.value.reduce((total, account) => {
    return total + parsedTokenBalance(account);
  }, 0);

  return {
    configured: true,
    owner,
    mint,
    accountCount: accounts.value.length,
    balance
  };
}

module.exports = {
  associatedTokenAddress,
  tokenBalanceForOwner
};
