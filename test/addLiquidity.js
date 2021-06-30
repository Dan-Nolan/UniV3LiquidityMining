const bn = require('bignumber.js');

const { formatEther, parseEther } = ethers.utils;
const { BigNumber } = ethers;

const nonFungiblePositionManagerAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

// https://github.com/Uniswap/uniswap-v3-periphery/blob/main/test/shared/encodePriceSqrt.ts#L4
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

// returns the sqrt price as a 64x96
// https://github.com/Uniswap/uniswap-v3-periphery/blob/main/test/shared/encodePriceSqrt.ts#L6-L16
function encodePriceSqrt(reserve1, reserve0) {
  return BigNumber.from(
    new bn(reserve1.toString())
      .div(reserve0.toString())
      .sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString()
  )
}

const FeeAmount = {
  LOW: 500,
  MEDIUM: 3000,
  HIGH: 10000,
}

const TICK_SPACINGS = {
  [FeeAmount.LOW]: 10,
  [FeeAmount.MEDIUM]: 60,
  [FeeAmount.HIGH]: 200,
}

const getMinTick = (tickSpacing) => Math.ceil(-887272 / tickSpacing) * tickSpacing;
const getMaxTick = (tickSpacing) => Math.floor(887272 / tickSpacing) * tickSpacing;

async function addLiquidity(tokenA, tokenB, amount) {
  if (tokenA.address.toLowerCase() > tokenB.address.toLowerCase()) {
    [tokenA, tokenB] = [tokenB, tokenA];
  }

  // 1. create a pool
  const poolInitializer = await ethers.getContractAt("IPoolInitializer", nonFungiblePositionManagerAddress);
  const tx = await poolInitializer.createAndInitializePoolIfNecessary(
    tokenA.address,
    tokenB.address,
    FeeAmount.MEDIUM,
    encodePriceSqrt(amount, amount)
  );
  const receipt = await tx.wait();

  const poolAddress = receipt.events[0].data.slice(-40);

  const [addr1] = await ethers.provider.listAccounts();

  const nft = await ethers.getContractAt("INonfungiblePositionManager", nonFungiblePositionManagerAddress);

  // 2. provide liquidity
  const deposit = parseEther(amount);

  await (await tokenA.approve(nonFungiblePositionManagerAddress, deposit)).wait();
  await (await tokenB.approve(nonFungiblePositionManagerAddress, deposit)).wait();

  const mintParams = {
    token0: tokenA.address,
    token1: tokenB.address,
    fee: FeeAmount.MEDIUM,
    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    recipient: addr1,
    amount0Desired: deposit,
    amount1Desired: deposit,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 19238129083
  }

  const mintTx = await nft.mint(mintParams);
  const mintReceipt = await mintTx.wait();
  const evt = mintReceipt.events.find(x => x.event === "Transfer");
  const {tokenId} = evt.args;

  return { poolAddress, tokenId }
}

module.exports = addLiquidity;
