/**
 * Example usage of RotatingProvider
 * 
 * This shows how to configure and use the rotating provider
 * with your Web3 application.
 */

// Preferred providers - these are tried first
var preferredProviders = [
  { 
    url: "https://polygon.drpc.org/",
    limitPerMinute: 100,
    limitPerHour: 1000,
    limitPerDay: 10000
  },
  { 
    url: "https://1rpc.io/matic",
    limitPerMinute: 50
  },
  { 
    url: "https://polygon-rpc.com",
    limitPerMinute: 100
  },
  { 
    url: "https://polygon-bor.publicnode.com",
    limitPerMinute: 100
  }
];

// Fallback providers - used when all preferred providers fail
var fallbackProviders = [
  { url: "https://api.blockeden.xyz/polygon/67nCBdZQSH9z3YqDDjdm" },
  { url: "https://polygon-mainnet.gateway.tatum.io/" },
  { url: "https://endpoints.omniatech.io/v1/matic/mainnet/public" },
  { url: "https://polygon.api.onfinality.io/public" }
];

// Create the rotating provider
var rotatingProvider = new RotatingProvider(preferredProviders, fallbackProviders);

// Use with Web3
var web3 = new Web3(rotatingProvider);

// Now you can use web3 as normal
// web3.eth.getBlockNumber().then(console.log);

// Check the global state anytime
// console.log(window.RPCState);
// console.log(window.RPCState.getStats());

/**
 * Simple string URL usage (without limits):
 * 
 * var provider = new RotatingProvider(
 *   ["https://polygon.drpc.org/", "https://1rpc.io/matic"],
 *   ["https://polygon-rpc.com"]
 * );
 */
