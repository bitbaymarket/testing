// Earn Tab Functionality for BitBay Treasury System
// Handles Lido HODL Vault, StableVault, Staking, and Voting

// ============================================================================
// TREASURY CONTRACT ADDRESSES
// ============================================================================

const TREASURY_ADDRESSES = {
  // Polygon Network
  BAYL_TREASURY: '0x8Ae919e6Aa571cF89de7fE2FB023B440e547A661',
  BAYR_TREASURY: '0x6cB65B186855d3E7f8C7c868998977C39B7C3687',
  VAULT: '0x5d181D4cF9DB85622857F6376b28e155048Bd6F2',
  FLOW_BAYL: '0xB9773b8F280b7c5c1Bf85528264c07fFc58dbc81',
  FLOW_BAYR: '0xA8aea8Ea55c9C9626234AB097d1d29eDF78da2ce',
  VOTE_BAYL: '0x08Da38A806B4F31397709849c5112e86738256b6',
  VOTE_BAYR: '0x3107Fea403D47C4B5a10df8f441f6436a54DFA6D',
  STABLE_POOL: '0x83274C25829bC746f80781A8E92E07875aDe53b9',
  STABLE_FEE_VAULT: '0x427C2BCE6c4041Bca17E46bc395DD7e7eF3568F8',
  AUTOBRIDGE: '0x1c682Bcb55B9be1296eed6e60dc0e4832b05B05A',
  UNISWAP_V4_POOL_MANAGER: '0x67366782805870060151383F4BbFF9daB53e5cD6',
  UNISWAP_V4_STATE_VIEW: '0x5eA1bD7974c8A611cBAB0bDCAFcB1D9CC9b3BA5a',
  USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  
  // Ethereum Network
  LIDO_VAULT: '0xf98eA1C9841cD1B4433cE3a1f0ad2BEa3406af7E',
  LIDO_STETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

var earnState = {
  stakingEnabled: false,
  stakingInterval: null,
  nextStakeTime: null,
  randomDelaySeconds: 0,
  ethWeb3: null, // Separate Web3 instance for Ethereum mainnet
  polWeb3: null, // Web3 instance for Polygon
  userVaultAddress: null,
  isPasswordLogin: false, // Track if user logged in with password
  lastEthCheck: 0,
  lastPolCheck: 0,
  minimumLidoCollectionTime: 7 * 24 * 60 * 60 * 1000, // 1 week in ms
  userTotalRewards: {} // Track total rewards per coin
};

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeEarnTab() {
  console.log('Initializing Earn tab...');
  
  // Initialize Ethereum Web3 for Lido operations
  earnState.ethWeb3 = new Web3('https://eth-mainnet.public.blastapi.io');
  
  // Use existing Polygon Web3 if available
  if (typeof web3 !== 'undefined') {
    earnState.polWeb3 = web3;
  }
  
  // Load saved staking state
  const stakingEnabled = localStorage.getItem('earnStakingEnabled');
  if (stakingEnabled === 'true') {
    const checkbox = document.getElementById('stakingEnabledCheckbox');
    if (checkbox) {
      checkbox.checked = true;
      earnState.stakingEnabled = true;
    }
  }
  
  // Load saved total rewards
  const savedRewards = localStorage.getItem('earnTotalRewards');
  if (savedRewards) {
    try {
      earnState.userTotalRewards = JSON.parse(savedRewards);
    } catch (e) {
      earnState.userTotalRewards = {};
    }
  }
  
  // Setup sub-tab navigation for Earn tab
  setupEarnSubTabs();
  
  // Setup lock days estimator
  setupLockDaysEstimator();
  
  console.log('Earn tab initialized');
}

// Function to be called when user logs in
async function onEarnUserLogin() {
  console.log('User logged in, initializing Earn data...');
  
  // Update polWeb3 reference
  if (typeof web3 !== 'undefined') {
    earnState.polWeb3 = web3;
  }
  
  // Detect login type
  earnState.isPasswordLogin = (loginType === 2);
  
  // Load initial data
  await refreshEarnTab();
  
  // Start staking automation if enabled and using password login
  if (earnState.stakingEnabled && earnState.isPasswordLogin) {
    startStakingAutomation();
  }
}

function setupEarnSubTabs() {
  const earnSubNav = document.querySelector('.earn-subnav');
  if (!earnSubNav) return;
  
  const subNavItems = earnSubNav.querySelectorAll('.tabs__nav-item');
  const subPanels = document.querySelectorAll('.earn-subtabs .tabs__panels > .tabs__panel');
  
  earnSubNav.addEventListener('click', (e) => {
    if (e.target.classList.contains('tabs__nav-item')) {
      const clickedIndex = Array.from(subNavItems).indexOf(e.target);
      
      // Update active nav item
      subNavItems.forEach(item => item.classList.remove('js-active'));
      e.target.classList.add('js-active');
      
      // Update active panel
      subPanels.forEach(panel => panel.classList.remove('js-active'));
      if (subPanels[clickedIndex]) {
        subPanels[clickedIndex].classList.add('js-active');
      }
    }
  });
}

function setupLockDaysEstimator() {
  const lockDaysInput = document.getElementById('lidoLockDays');
  const estimateSpan = document.getElementById('lidoLockEstimate');
  
  if (lockDaysInput && estimateSpan) {
    lockDaysInput.addEventListener('input', () => {
      const days = parseFloat(lockDaysInput.value) || 0;
      const months = Math.floor(days / 30);
      const years = Math.floor(days / 365);
      
      if (years > 0) {
        estimateSpan.textContent = `${years}y ${Math.floor((days % 365) / 30)}m`;
      } else if (months > 0) {
        estimateSpan.textContent = `${months}m`;
      } else {
        estimateSpan.textContent = `${days}d`;
      }
    });
  }
}

// ============================================================================
// LIDO HODL VAULT FUNCTIONS
// ============================================================================

async function loadLidoVaultInfo() {
  if (!earnState.ethWeb3) return;
  
  try {
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    
    // Get total principal and yield
    const totalPrincipal = await lidoContract.methods.totalPrincipal().call();
    const totalYield = await lidoContract.methods.totalYield().call();
    
    // Convert from wei to ETH
    const principalETH = earnState.ethWeb3.utils.fromWei(totalPrincipal, 'ether');
    const yieldETH = earnState.ethWeb3.utils.fromWei(totalYield, 'ether');
    
    document.getElementById('lidoTotalPrincipal').textContent = parseFloat(principalETH).toFixed(4);
    document.getElementById('lidoTotalYield').textContent = parseFloat(yieldETH).toFixed(4);
    
    // Get current and next epoch unlock amounts
    const epochLength = await lidoContract.methods.EPOCH_LENGTH().call();
    const currentTime = Math.floor(Date.now() / 1000);
    const currentEpoch = Math.floor(currentTime / epochLength);
    const nextEpoch = currentEpoch + 1;
    
    const currentEpochUnlock = await lidoContract.methods.unlockAmountByEpoch(currentEpoch).call();
    const nextEpochUnlock = await lidoContract.methods.unlockAmountByEpoch(nextEpoch).call();
    
    document.getElementById('lidoCurrentEpochUnlock').textContent = 
      parseFloat(earnState.ethWeb3.utils.fromWei(currentEpochUnlock, 'ether')).toFixed(4);
    document.getElementById('lidoNextEpochUnlock').textContent = 
      parseFloat(earnState.ethWeb3.utils.fromWei(nextEpochUnlock, 'ether')).toFixed(4);
    
  } catch (error) {
    console.error('Error loading Lido vault info:', error);
  }
}

async function loadUserLidoPosition() {
  if (!earnState.ethWeb3 || !myaccountsV2) return;
  
  try {
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    const userDeposit = await lidoContract.methods.deposits(myaccountsV2).call();
    
    if (userDeposit.amount > 0) {
      const amountETH = earnState.ethWeb3.utils.fromWei(userDeposit.amount, 'ether');
      const unlockDate = new Date(userDeposit.unlockTimestamp * 1000);
      
      document.getElementById('userLidoAmount').textContent = parseFloat(amountETH).toFixed(4);
      document.getElementById('userLidoUnlockDate').textContent = unlockDate.toLocaleDateString();
      document.getElementById('userLidoPosition').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading user Lido position:', error);
  }
}

async function loadETHBalances() {
  if (!earnState.ethWeb3 || !myaccountsV2) return;
  
  try {
    // Get ETH balance
    const ethBalance = await earnState.ethWeb3.eth.getBalance(myaccountsV2);
    const ethBalanceETH = earnState.ethWeb3.utils.fromWei(ethBalance, 'ether');
    document.getElementById('ethBalance').textContent = parseFloat(ethBalanceETH).toFixed(4);
    
    // Show gas warning if low
    if (parseFloat(ethBalanceETH) < 0.01) {
      document.getElementById('ethGasWarning').classList.remove('hidden');
    } else {
      document.getElementById('ethGasWarning').classList.add('hidden');
    }
    
    // Get stETH balance
    const stETHContract = new earnState.ethWeb3.eth.Contract(
      [{
        "constant": true,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
      }],
      TREASURY_ADDRESSES.LIDO_STETH
    );
    
    const stETHBalance = await stETHContract.methods.balanceOf(myaccountsV2).call();
    const stETHBalanceETH = earnState.ethWeb3.utils.fromWei(stETHBalance, 'ether');
    
    if (parseFloat(stETHBalanceETH) > 0) {
      document.getElementById('lidoBalance').textContent = parseFloat(stETHBalanceETH).toFixed(4);
      document.getElementById('lidoBalanceField').classList.remove('hidden');
    }
    
    document.getElementById('ethBalances').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading ETH balances:', error);
  }
}

async function depositLidoHODL() {
  // Show UniSwap disclaimer first (for ETH deposits that will be swapped)
  // Then show Lido-specific disclaimer
  const result = await Swal.fire({
    title: 'Deposit to Lido HODL Vault',
    html: `
      <p><strong>Important:</strong></p>
      <ul style="text-align: left;">
        <li>Your ETH will be automatically converted to staked ETH via Lido</li>
        <li>Your entire principal will be locked for the duration you specify</li>
        <li>100% of staking profits go to BAY stakers</li>
        <li>Lido is one of the oldest and most well-audited staking contracts</li>
        <li>The main risk is the Lido contract itself (highly unlikely)</li>
        <li><strong>Please verify your unlock date before confirming</strong></li>
      </ul>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'I Understand, Continue',
    cancelButtonText: 'Cancel'
  });
  
  if (!result.isConfirmed) return;
  
  const amount = document.getElementById('lidoDepositAmount').value;
  const lockDays = document.getElementById('lidoLockDays').value;
  
  if (!amount || parseFloat(amount) <= 0) {
    Swal.fire('Error', 'Please enter a valid amount', 'error');
    return;
  }
  
  if (!lockDays || parseInt(lockDays) < 1) {
    Swal.fire('Error', 'Please enter valid lock days', 'error');
    return;
  }
  
  // TODO: Implement actual deposit logic
  Swal.fire('Coming Soon', 'Lido HODL deposits will be available soon', 'info');
}

async function withdrawLidoHODL() {
  // TODO: Check if funds are unlocked
  Swal.fire('Coming Soon', 'Lido HODL withdrawals will be available soon', 'info');
}

// ============================================================================
// STABLEVAULT FUNCTIONS
// ============================================================================

async function loadStableVaultInfo() {
  if (!earnState.polWeb3) return;
  
  try {
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    
    // Get total shares (represents total DAI in pool)
    const totalShares = await stableContract.methods.totalShares().call();
    const totalDAI = earnState.polWeb3.utils.fromWei(totalShares, 'ether');
    document.getElementById('stableTotalDAI').textContent = parseFloat(totalDAI).toFixed(2);
    
    // Get current tick position
    const tickLower = await stableContract.methods.tickLower().call();
    const tickUpper = await stableContract.methods.tickUpper().call();
    document.getElementById('stableCurrentTick').textContent = `${tickLower} to ${tickUpper}`;
    
    // Check if position is in range
    const stateView = new earnState.polWeb3.eth.Contract(
      [{
        "inputs": [{"name": "poolId", "type": "bytes32"}],
        "name": "getSlot0",
        "outputs": [
          {"name": "sqrtPriceX96", "type": "uint160"},
          {"name": "tick", "type": "int24"},
          {"name": "protocolFee", "type": "uint24"},
          {"name": "lpFee", "type": "uint24"}
        ],
        "stateMutability": "view",
        "type": "function"
      }],
      TREASURY_ADDRESSES.UNISWAP_V4_STATE_VIEW
    );
    
    // Get pool key to check current tick
    const liquidity = await stableContract.methods.liquidity().call();
    const isInRange = parseInt(liquidity) > 0;
    document.getElementById('stableInRange').textContent = isInRange ? '✅ Yes' : '❌ No';
    
    // Get commission
    const commission = await stableContract.methods.commission().call();
    document.getElementById('stableCommission').textContent = commission;
    
    // Check which treasury it sends to
    const treasury = await stableContract.methods.treasury().call();
    const isBaylTreasury = treasury.toLowerCase() === TREASURY_ADDRESSES.BAYL_TREASURY.toLowerCase();
    document.getElementById('stableSendsTo').textContent = isBaylTreasury ? 'BAYL Liquid' : 'BAYR Reserve';
    
    // Calculate weekly rewards
    const currentWeek = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    // We'd need to iterate through recent weeks to calculate this
    document.getElementById('stableWeeklyRewards').textContent = 'Calculating...';
    
    // Load user position if logged in
    if (myaccountsV2) {
      await loadUserStablePosition(stableContract, totalShares);
    }
    
  } catch (error) {
    console.error('Error loading StableVault info:', error);
  }
}

async function loadUserStablePosition(stableContract, totalShares) {
  try {
    const userShares = await stableContract.methods.shares(myaccountsV2).call();
    
    if (parseInt(userShares) > 0) {
      const userDAI = earnState.polWeb3.utils.fromWei(userShares, 'ether');
      const percent = (parseFloat(userShares) / parseFloat(totalShares)) * 100;
      
      document.getElementById('userStableDAI').textContent = parseFloat(userDAI).toFixed(2);
      document.getElementById('userStablePercent').textContent = percent.toFixed(4);
      
      // Calculate anticipated weekly profit (rough estimate)
      // This would be percent of weekly rewards minus commission
      document.getElementById('userStableWeeklyProfit').textContent = '0.00';
      
      // Get pending fees
      const feeVault = await stableContract.methods.feeVault().call();
      const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
      const pendingFees = await feeVaultContract.methods.pendingFees(myaccountsV2).call();
      
      const pendingDAI = earnState.polWeb3.utils.fromWei(pendingFees[0], 'ether');
      const pendingUSDC = earnState.polWeb3.utils.fromWei(pendingFees[1], 'mwei'); // USDC has 6 decimals
      const totalPendingUSD = parseFloat(pendingDAI) + parseFloat(pendingUSDC);
      
      document.getElementById('userStablePendingFees').textContent = totalPendingUSD.toFixed(2);
      document.getElementById('userStablePosition').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading user StableVault position:', error);
  }
}

async function depositStableVault() {
  if (!earnState.polWeb3 || !myaccountsV2 || loginType !== 2) {
    Swal.fire('Error', 'Please login with password to use StableVault', 'error');
    return;
  }
  
  // Show trading disclaimer first
  const result = await Swal.fire({
    title: 'StableVault Deposit',
    html: `
      <p><strong>Disclaimer:</strong></p>
      <ul style="text-align: left;">
        <li>Stablecoin pairs are very low risk but you should always audit the code</li>
        <li>BitBay is a community-driven project and not responsible for bugs, errors, or omissions</li>
        <li>The position is managed by stakers within very tight ranges</li>
        <li>Impermanent loss is very unlikely due to tight ranges pegged at $1</li>
        <li>DAI and USDC are bridged tokens - understand their risks</li>
        <li>UniSwap V4 risks apply - do your due diligence</li>
      </ul>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'I Understand, Continue',
    cancelButtonText: 'Cancel'
  });
  
  if (!result.isConfirmed) return;
  
  const amount = document.getElementById('stableDepositAmount').value;
  const shouldDonate = document.getElementById('stableDonateCheckbox').checked;
  
  if (!amount || parseFloat(amount) <= 0) {
    Swal.fire('Error', 'Please enter a valid DAI amount', 'error');
    return;
  }
  
  try {
    showSpinner();
    
    const amountWei = earnState.polWeb3.utils.toWei(amount, 'ether');
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const daiContract = new earnState.polWeb3.eth.Contract(
      [{
        "constant": false,
        "inputs": [
          {"name": "spender", "type": "address"},
          {"name": "amount", "type": "uint256"}
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function"
      }],
      '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' // DAI on Polygon
    );
    
    // Approve DAI
    const approveTx = await daiContract.methods.approve(TREASURY_ADDRESSES.STABLE_POOL, amountWei).send({
      from: myaccountsV2,
      gas: 100000,
      gasPrice: gasPrice
    });
    
    // Deposit with 5 minute deadline
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const depositTx = await stableContract.methods.deposit(amountWei, deadline).send({
      from: myaccountsV2,
      gas: 500000,
      gasPrice: gasPrice
    });
    
    // If user wants to donate, set sendTo address
    if (shouldDonate) {
      const feeVault = await stableContract.methods.feeVault().call();
      const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
      
      // Choose BAYL or BAYR based on which pool
      const donateAddress = '0x...' // TODO: Get BAYL/DAI or BAYR/DAI pair address
      await feeVaultContract.methods.changeSendTo(donateAddress).send({
        from: myaccountsV2,
        gas: 100000,
        gasPrice: gasPrice
      });
    }
    
    hideSpinner();
    Swal.fire('Success', 'Deposit successful!', 'success');
    await refreshEarnTab();
    
  } catch (error) {
    hideSpinner();
    console.error('Error depositing to StableVault:', error);
    Swal.fire('Error', error.message || 'Deposit failed', 'error');
  }
}

async function collectStableFees() {
  if (!earnState.polWeb3 || !myaccountsV2 || loginType !== 2) {
    Swal.fire('Error', 'Please login with password to collect fees', 'error');
    return;
  }
  
  try {
    showSpinner();
    
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const deadline = Math.floor(Date.now() / 1000) + 300;
    
    await stableContract.methods.collectFees(deadline).send({
      from: myaccountsV2,
      gas: 500000,
      gasPrice: gasPrice
    });
    
    hideSpinner();
    Swal.fire('Success', 'Fees collected!', 'success');
    await refreshEarnTab();
    
  } catch (error) {
    hideSpinner();
    console.error('Error collecting fees:', error);
    Swal.fire('Error', error.message || 'Fee collection failed', 'error');
  }
}

async function withdrawStableVault() {
  if (!earnState.polWeb3 || !myaccountsV2 || loginType !== 2) {
    Swal.fire('Error', 'Please login with password to withdraw', 'error');
    return;
  }
  
  const result = await Swal.fire({
    title: 'Withdraw from StableVault',
    input: 'number',
    inputLabel: 'Percentage to withdraw (1-100)',
    inputPlaceholder: '100',
    showCancelButton: true,
    inputValidator: (value) => {
      if (!value || parseFloat(value) <= 0 || parseFloat(value) > 100) {
        return 'Please enter a valid percentage (1-100)';
      }
    }
  });
  
  if (!result.isConfirmed) return;
  
  try {
    showSpinner();
    
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const userShares = await stableContract.methods.shares(myaccountsV2).call();
    
    const withdrawPercent = parseFloat(result.value);
    const withdrawShares = (BigInt(userShares) * BigInt(Math.floor(withdrawPercent * 100))) / BigInt(10000);
    
    const deadline = Math.floor(Date.now() / 1000) + 300;
    
    // Withdraw with dust collection enabled
    await stableContract.methods.withdraw(withdrawShares.toString(), deadline, true).send({
      from: myaccountsV2,
      gas: 700000,
      gasPrice: gasPrice
    });
    
    hideSpinner();
    Swal.fire('Success', 'Withdrawal successful!', 'success');
    await refreshEarnTab();
    
  } catch (error) {
    hideSpinner();
    console.error('Error withdrawing from StableVault:', error);
    Swal.fire('Error', error.message || 'Withdrawal failed', 'error');
  }

// ============================================================================
// STAKING FUNCTIONS
// ============================================================================

function toggleStaking() {
  const checkbox = document.getElementById('stakingEnabledCheckbox');
  earnState.stakingEnabled = checkbox.checked;
  
  localStorage.setItem('earnStakingEnabled', earnState.stakingEnabled ? 'true' : 'false');
  
  if (earnState.stakingEnabled) {
    startStakingAutomation();
    document.getElementById('stakingAutomationInfo').classList.remove('hidden');
  } else {
    stopStakingAutomation();
    document.getElementById('stakingAutomationInfo').classList.add('hidden');
  }
}

function startStakingAutomation() {
  if (earnState.stakingInterval) {
    clearInterval(earnState.stakingInterval);
  }
  
  // Generate random delay (0-10 minutes)
  earnState.randomDelaySeconds = Math.floor(Math.random() * 600);
  
  console.log('Starting staking automation with random delay:', earnState.randomDelaySeconds, 'seconds');
  
  // Check staking conditions every minute
  earnState.stakingInterval = setInterval(checkStakingConditions, 60000);
  
  // Do initial check
  checkStakingConditions();
}

function stopStakingAutomation() {
  if (earnState.stakingInterval) {
    clearInterval(earnState.stakingInterval);
    earnState.stakingInterval = null;
  }
  
  console.log('Staking automation stopped');
}

async function checkStakingConditions() {
  if (!earnState.stakingEnabled || !earnState.isPasswordLogin) {
    return;
  }
  
  console.log('Checking staking conditions...');
  
  // TODO: Implement comprehensive staking checks:
  // 1. Check if we're 85% into the stake interval
  // 2. Check POL balance (warn if < 30, pause if < 10)
  // 3. Check Flow contract for pending ETH
  // 4. Check Lido for yield to harvest
  // 5. Check StableVault position
  // 6. Check for inactive users to update
  // 7. Execute stake/claim if ready
}

async function loadStakingInfo() {
  if (!earnState.polWeb3 || !myaccountsV2) return;
  
  try {
    // Get user's vault address
    const vaultContract = new earnState.polWeb3.eth.Contract(vaultABI, TREASURY_ADDRESSES.VAULT);
    earnState.userVaultAddress = await vaultContract.methods.getVaultAddress(myaccountsV2).call();
    
    if (earnState.userVaultAddress) {
      document.getElementById('userVaultAddress').textContent = 
        earnState.userVaultAddress.substring(0, 10) + '...' + earnState.userVaultAddress.substring(38);
    }
    
    // Load BAYL treasury info
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    
    const totalTokens = await baylTreasury.methods.totalTokens().call();
    const totalShares = await baylTreasury.methods.totalShares().call();
    const refreshRate = await baylTreasury.methods.refreshRate().call();
    const claimRate = await baylTreasury.methods.claimRate().call();
    
    document.getElementById('baylTotalStaked').textContent = 
      parseFloat(earnState.polWeb3.utils.fromWei(totalTokens, 'ether')).toFixed(2);
    document.getElementById('baylTotalShares').textContent = totalShares;
    document.getElementById('baylRefreshRate').textContent = 
      Math.floor(refreshRate / 86400) + ' days';
    document.getElementById('baylClaimRate').textContent = claimRate + ' blocks';
    
    // Load user staking info
    const userInfo = await baylTreasury.methods.accessPool(myaccountsV2).call();
    document.getElementById('userShares').textContent = 
      parseFloat(earnState.polWeb3.utils.fromWei(userInfo.shares, 'ether')).toFixed(2);
    
    if (userInfo.lastRefresh > 0) {
      const lastRefreshDate = new Date(userInfo.lastRefresh * 1000);
      document.getElementById('userLastRefresh').textContent = lastRefreshDate.toLocaleString();
      
      // Check if user is stale (lastRefresh == 1 means paused)
      if (userInfo.lastRefresh == 1) {
        document.getElementById('userLastRefresh').innerHTML += ' <span style="color: red;">(Paused)</span>';
      }
    }
    
    // Get user's tracked coins
    const userCoins = await baylTreasury.methods.getUserCoins(myaccountsV2).call();
    if (userCoins && userCoins.length > 0) {
      const coinNames = [];
      if (userCoins.includes('0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619')) coinNames.push('WETH');
      if (userCoins.includes('0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063')) coinNames.push('DAI');
      if (userCoins.includes(TREASURY_ADDRESSES.USDC)) coinNames.push('USDC');
      document.getElementById('userTrackingCoins').textContent = coinNames.join(', ') || 'None';
      
      // Get pending rewards for each coin
      let rewardsHTML = '';
      for (const coin of userCoins) {
        const pending = await baylTreasury.methods.getPendingReward(myaccountsV2, coin).call();
        if (parseInt(pending) > 0) {
          let coinName = coin.substring(0, 10) + '...';
          if (coin.toLowerCase() === '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'.toLowerCase()) coinName = 'WETH';
          if (coin.toLowerCase() === '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'.toLowerCase()) coinName = 'DAI';
          if (coin.toLowerCase() === TREASURY_ADDRESSES.USDC.toLowerCase()) coinName = 'USDC';
          
          const decimals = coinName === 'USDC' ? 'mwei' : 'ether';
          const pendingAmount = earnState.polWeb3.utils.fromWei(pending, decimals);
          rewardsHTML += `<div>${coinName}: ${parseFloat(pendingAmount).toFixed(6)}</div>`;
        }
      }
      document.getElementById('userPendingRewards').innerHTML = rewardsHTML || 'No pending rewards';
    } else {
      document.getElementById('userTrackingCoins').textContent = 'None set';
    }
    
    // Display total rewards from localStorage
    let totalRewardsHTML = '';
    for (const [coin, amount] of Object.entries(earnState.userTotalRewards)) {
      totalRewardsHTML += `<div>${coin}: ${amount}</div>`;
    }
    document.getElementById('userTotalRewards').innerHTML = totalRewardsHTML || 'No rewards collected yet';
    
    // Load BAYL and BAYR balances at vault
    if (earnState.userVaultAddress) {
      const baylContract = new earnState.polWeb3.eth.Contract(
        [{
          "constant": true,
          "inputs": [{"name": "account", "type": "address"}],
          "name": "balanceOf",
          "outputs": [{"name": "", "type": "uint256"}],
          "type": "function"
        }],
        await vaultContract.methods.BAYL().call()
      );
      
      const bayrContract = new earnState.polWeb3.eth.Contract(
        [{
          "constant": true,
          "inputs": [{"name": "account", "type": "address"}],
          "name": "balanceOf",
          "outputs": [{"name": "", "type": "uint256"}],
          "type": "function"
        }],
        await vaultContract.methods.BAYR().call()
      );
      
      const baylBalance = await baylContract.methods.balanceOf(earnState.userVaultAddress).call();
      const bayrBalance = await bayrContract.methods.balanceOf(earnState.userVaultAddress).call();
      
      document.getElementById('vaultBaylBalance').textContent = 
        parseFloat(earnState.polWeb3.utils.fromWei(baylBalance, 'ether')).toFixed(2);
      document.getElementById('vaultBayrBalance').textContent = 
        parseFloat(earnState.polWeb3.utils.fromWei(bayrBalance, 'ether')).toFixed(2);
      
      document.getElementById('vaultBalances').classList.remove('hidden');
    }
    
    document.getElementById('userStakingInfo').classList.remove('hidden');
    
    // Check POL balance for gas warning
    const polBalance = await earnState.polWeb3.eth.getBalance(myaccountsV2);
    const polBalanceEther = parseFloat(earnState.polWeb3.utils.fromWei(polBalance, 'ether'));
    
    if (polBalanceEther < 30) {
      document.getElementById('stakingPolBalance').textContent = polBalanceEther.toFixed(2);
      document.getElementById('stakingGasWarning').classList.remove('hidden');
    }
    
  } catch (error) {
    console.error('Error loading staking info:', error);
  }
}

async function loadTopStakers() {
  if (!earnState.polWeb3) return;
  
  try {
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    const topStakers = await baylTreasury.methods.getTopStakers().call();
    
    let html = '<ol>';
    for (const staker of topStakers) {
      if (staker.shares > 0) {
        html += `<li>${staker.user.substring(0, 10)}...: ${earnState.polWeb3.utils.fromWei(staker.shares, 'ether')} BAYL</li>`;
      }
    }
    html += '</ol>';
    
    document.getElementById('topStakersList').innerHTML = html || '<p>No stakers yet</p>';
    
  } catch (error) {
    console.error('Error loading top stakers:', error);
  }
}

async function depositStake() {
  const result = await Swal.fire({
    title: 'Staking Disclaimer',
    html: `
      <p>Rewards are not guaranteed and are based on users who opt-in. This system is not a security because there is no common enterprise. In exchange for protocol fees, you are doing work by securing the blockchain, managing the stablecoin position, and voting on important protocol decisions.</p>
      <p><a href="https://bitbay.market/downloads/whitepapers/Protocol-owned-assets.pdf" target="_blank">Learn more about BitBay staking</a></p>
    `,
    icon: 'info',
    showCancelButton: true,
    confirmButtonText: 'I Understand, Continue',
    cancelButtonText: 'Cancel'
  });
  
  if (!result.isConfirmed) return;
  
  const amount = document.getElementById('stakingDepositAmount').value;
  
  if (!amount || parseFloat(amount) <= 0) {
    Swal.fire('Error', 'Please enter a valid amount', 'error');
    return;
  }
  
  // TODO: Implement actual staking deposit
  // Before first deposit, set coins to WETH, DAI, USDC
  Swal.fire('Coming Soon', 'Staking deposits will be available soon', 'info');
}

async function unstakeBAYL() {
  // TODO: Implement unstaking
  Swal.fire('Coming Soon', 'Unstaking will be available soon', 'info');
}

async function claimStakingRewards() {
  // TODO: Implement claiming rewards with voting
  Swal.fire('Coming Soon', 'Claiming rewards will be available soon', 'info');
}

// ============================================================================
// VOTING FUNCTIONS
// ============================================================================

async function loadVotingInfo() {
  if (!earnState.polWeb3) return;
  
  try {
    const voteContract = new earnState.polWeb3.eth.Contract(stakingVoteABI, TREASURY_ADDRESSES.VOTE_BAYL);
    
    // TODO: Load voting information
    document.getElementById('currentVoteEpoch').textContent = 'Loading...';
    document.getElementById('voteEpochBlocks').textContent = 'Loading...';
    
  } catch (error) {
    console.error('Error loading voting info:', error);
  }
}

function showCreateVoteDialog() {
  Swal.fire({
    title: 'Create New Vote',
    html: `
      <p>Vote creation interface coming soon...</p>
      <p>You will be able to add function calls with payloads (uint, string, bytes, address)</p>
    `,
    icon: 'info'
  });
}

function showVoteDetailsDialog() {
  Swal.fire({
    title: 'Vote Details',
    html: '<p>Select a vote to view its details...</p>',
    icon: 'info'
  });
}

// ============================================================================
// ROI CALCULATION
// ============================================================================

async function calculateAndDisplayROI() {
  // TODO: Calculate yearly ROI based on weekly profits
  // Only display if > 5%
}

// ============================================================================
// REFRESH FUNCTIONS
// ============================================================================

async function refreshEarnTab() {
  const now = Date.now();
  
  // Refresh Ethereum data (less frequently - every 5 minutes)
  if (now - earnState.lastEthCheck > 300000) {
    earnState.lastEthCheck = now;
    await loadLidoVaultInfo();
    await loadUserLidoPosition();
    await loadETHBalances();
  }
  
  // Refresh Polygon data (more frequently - every minute)
  if (now - earnState.lastPolCheck > 60000) {
    earnState.lastPolCheck = now;
    await loadStableVaultInfo();
    await loadStakingInfo();
    await loadTopStakers();
    await loadVotingInfo();
  }
  
  await calculateAndDisplayROI();
}

// ============================================================================
// INITIALIZATION ON PAGE LOAD
// ============================================================================

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    initializeEarnTab();
    
    // Set up periodic refresh
    setInterval(refreshEarnTab, 60000); // Every minute
  });
}
