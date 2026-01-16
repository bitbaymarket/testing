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
  DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  
  // LP Pairs
  BAYL_DAI_UNISWAP: '0x37f75363c6552D47106Afb9CFdA8964610207938',
  BAYR_DAI_UNISWAP: '0x63Ff2f545E4CbCfeBBdeE27bB5dA56fdEE076524',
  
  // Chainlink Price Feeds
  ETH_USD_FEED: '0xF9680D99D6C9589e2a93a78A04A279e509205945', // ETH/USD on Polygon
  
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
  userTotalRewards: {}, // Track total rewards per coin
  consoleLog: [] // Console log for transactions (max 100)
};

// ============================================================================
// CONSOLE LOGGING FOR AUTOMATION
// ============================================================================

function logToConsole(message) {
  const timestamp = new Date().toLocaleString();
  const logEntry = `[${timestamp}] ${message}`;
  
  earnState.consoleLog.unshift(logEntry);
  
  // Keep only last 100 messages
  if (earnState.consoleLog.length > 100) {
    earnState.consoleLog = earnState.consoleLog.slice(0, 100);
  }
  
  // Save to localStorage
  try {
    localStorage.setItem('earnConsoleLog', JSON.stringify(earnState.consoleLog));
  } catch (e) {
    console.error('Failed to save console log:', e);
  }
  
  // Also log to browser console
  console.log(logEntry);
}

// Helper function to show vote payload details
function showVotePayload(hash) {
  if (!earnState.polWeb3) return;
  
  const voteContract = new earnState.polWeb3.eth.Contract(stakingABI, TREASURY_ADDRESSES.VOTE_BAYL);
  
  voteContract.methods.getProposalPayload(hash).call().then(payload => {
    let html = `<div style="text-align: left; font-family: monospace; font-size: 0.85em;">`;
    html += `<p><strong>Hash:</strong> ${hash}</p>`;
    html += `<p><strong>Payload:</strong></p>`;
    html += `<pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; max-height: 300px; overflow-y: auto;">${JSON.stringify(payload, null, 2)}</pre>`;
    html += `</div>`;
    
    Swal.fire({
      title: 'Vote Details',
      html: html,
      width: '700px',
      confirmButtonText: 'Close'
    });
  }).catch(error => {
    Swal.fire('Error', 'Failed to load vote details', 'error');
  });
}

function showConsoleHistory() {
  // Toggle console visibility instead of showing popup
  const consoleDiv = document.getElementById('stakingConsole');
  if (consoleDiv) {
    if (consoleDiv.classList.contains('hidden')) {
      consoleDiv.classList.remove('hidden');
      const consoleContent = document.getElementById('stakingConsoleContent');
      if (consoleContent) {
        consoleContent.textContent = earnState.consoleLog.join('\n') || 'No logs yet';
        // Scroll to bottom
        consoleContent.scrollTop = consoleContent.scrollHeight;
      }
    } else {
      consoleDiv.classList.add('hidden');
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS FOR SAFE NUMBER HANDLING
// ============================================================================

// Helper to convert BAY token amounts (8 decimals) using BigNumber
function formatBAYAmount(amountString) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return new BN(amountString).dividedBy('1e8').toFixed();
}

// Helper to display BAY amounts with proper decimals
function displayBAYAmount(amountString, decimals = 2) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return stripZeros(new BN(amountString).dividedBy('1e8').toFixed(decimals));
}

// Helper for ETH amounts (18 decimals)
function displayETHAmount(amountString, decimals = 4) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return stripZeros(new BN(amountString).dividedBy('1e18').toFixed(decimals));
}

// Helper for USDC amounts (6 decimals)
function displayUSDCAmount(amountString, decimals = 2) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return stripZeros(new BN(amountString).dividedBy('1e6').toFixed(decimals));
}

// Helper to check if BigNumber is greater than zero
function isGreaterThanZero(amountString) {
  if (!amountString) return false;
  const BN = BigNumber;
  return new BN(amountString).gt(new BN('0'));
}

// stripZeros function is already defined in index.html, no need to redefine

// Helper to format ETH amounts (18 decimals) without stripping zeros
function formatETHAmount(amountString, decimals = 4) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return new BN(amountString).dividedBy('1e18').toFixed(decimals);
}

// Helper to format DAI amounts (18 decimals) without stripping zeros
function formatDAIAmount(amountString, decimals = 2) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return new BN(amountString).dividedBy('1e18').toFixed(decimals);
}

// Helper to format USDC amounts (6 decimals) without stripping zeros
function formatUSDCAmount(amountString, decimals = 2) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return new BN(amountString).dividedBy('1e6').toFixed(decimals);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeEarnTab() {
  console.log('Initializing Earn tab...');
  
  // Initialize Ethereum Web3 for Lido operations
  earnState.ethWeb3 = new Web3('https://eth-mainnet.public.blastapi.io');
  
  // Use existing Polygon Web3 if available
  earnState.polWeb3 = new Web3('https://polygon-rpc.com');
  
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
  
  // Load console log
  const savedLog = localStorage.getItem('earnConsoleLog');
  if (savedLog) {
    try {
      earnState.consoleLog = JSON.parse(savedLog);
    } catch (e) {
      earnState.consoleLog = [];
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
  earnState.polWeb3 = new Web3('https://polygon-rpc.com');
  
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
      const days = parseInt(lockDaysInput.value) || 0;
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
    
    // Convert from wei to ETH using BigNumber
    const principalETH = formatETHAmount(totalPrincipal, 4);
    const yieldETH = formatETHAmount(totalYield, 4);
    
    document.getElementById('lidoTotalPrincipal').textContent = principalETH;
    document.getElementById('lidoTotalYield').textContent = yieldETH;
    
    // Get current and next epoch unlock amounts
    const epochLength = await lidoContract.methods.EPOCH_LENGTH().call();
    const currentTime = Math.floor(Date.now() / 1000);
    const currentEpoch = Math.floor(currentTime / epochLength);
    const nextEpoch = currentEpoch + 1;
    
    const currentEpochUnlock = await lidoContract.methods.unlockAmountByEpoch(currentEpoch).call();
    const nextEpochUnlock = await lidoContract.methods.unlockAmountByEpoch(nextEpoch).call();
    
    document.getElementById('lidoCurrentEpochUnlock').textContent = formatETHAmount(currentEpochUnlock, 4);
    document.getElementById('lidoNextEpochUnlock').textContent = formatETHAmount(nextEpochUnlock, 4);
    
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
      const amountETH = formatETHAmount(userDeposit.amount, 4);
      const unlockDate = new Date(userDeposit.unlockTimestamp * 1000);
      
      document.getElementById('userLidoAmount').textContent = amountETH;
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
    const BN = earnState.ethWeb3.utils.BN;
    
    // Get ETH balance
    const ethBalance = await earnState.ethWeb3.eth.getBalance(myaccountsV2);
    const ethBalanceETH = formatETHAmount(ethBalance, 4);
    document.getElementById('ethBalance').textContent = ethBalanceETH;
    
    // Show gas warning if low (0.01 ETH)
    const lowBalanceThreshold = earnState.ethWeb3.utils.toWei('0.01', 'ether');
    if (new BN(ethBalance).lt(new BN(lowBalanceThreshold))) {
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
    
    if (new BN(stETHBalance).gt(new BN('0'))) {
      const stETHBalanceETH = formatETHAmount(stETHBalance, 4);
      document.getElementById('lidoBalance').textContent = stETHBalanceETH;
      document.getElementById('lidoBalanceField').classList.remove('hidden');
    }
    
    document.getElementById('ethBalances').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading ETH balances:', error);
  }
}

async function depositLidoHODL() {
  if (!earnState.ethWeb3 || !myaccountsV2) {
    Swal.fire('Error', 'Please connect your wallet first', 'error');
    return;
  }
  
  try {
    // Get user's current position and min/max days
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    const userDeposit = await lidoContract.methods.deposits(myaccountsV2).call();
    const minDays = await lidoContract.methods.mindays().call();
    const maxDays = await lidoContract.methods.maxdays().call();
    
    // Get ETH and stETH balances
    const ethBalance = await earnState.ethWeb3.eth.getBalance(myaccountsV2);
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
    
    const hasETH = earnState.ethWeb3.utils.toBN(ethBalance).gt(earnState.ethWeb3.utils.toBN('0'));
    const hasStETH = earnState.ethWeb3.utils.toBN(stETHBalance).gt(earnState.ethWeb3.utils.toBN('0'));
    const hasExistingDeposit = earnState.ethWeb3.utils.toBN(userDeposit.amount).gt(earnState.ethWeb3.utils.toBN('0'));
    
    // Build deposit form
    let depositOptions = '';
    if (hasETH) {
      depositOptions += '<option value="eth">Deposit ETH (will be swapped to stETH)</option>';
    }
    if (hasStETH) {
      depositOptions += '<option value="steth">Deposit stETH</option>';
    }
    
    if (!hasETH && !hasStETH) {
      Swal.fire('Error', 'You need ETH or stETH to deposit', 'error');
      return;
    }
    
    let incrementOption = '';
    if (hasExistingDeposit) {
      incrementOption = `
        <div style="margin-top: 15px;">
          <label style="display: flex; align-items: center;">
            <input type="checkbox" id="incrementLock" style="margin-right: 8px;" checked />
            <span>Extend existing lock period (add to current ${earnState.ethWeb3.utils.fromWei(userDeposit.amount, 'ether')} stETH)</span>
          </label>
        </div>
      `;
    }
    
    const result = await Swal.fire({
      title: 'Deposit to Lido HODL Vault',
      html: `
        <div style="text-align: left;">
          <label>Deposit Type:</label>
          <select id="depositType" class="swal2-select" style="width: 100%;">
            ${depositOptions}
          </select>
          
          <label style="margin-top: 15px; display: block;">Amount:</label>
          <input type="number" id="depositAmount" class="swal2-input" placeholder="0.0" step="0.001" style="width: 100%;" />
          
          <label style="margin-top: 15px; display: block;">Lock Period (days, min: ${minDays}, max: ${maxDays}):</label>
          <input type="number" id="lockDays" class="swal2-input" placeholder="${minDays}" min="${minDays}" max="${maxDays}" style="width: 100%;" />
          <div id="lockEstimate" style="margin-top: 5px; font-size: 0.9em; color: #666;"></div>
          
          ${incrementOption}
          
          <div id="slippageSection" style="margin-top: 15px; display: none;">
            <label>Slippage Tolerance (basis points, max 1000 = 10%):</label>
            <input type="number" id="slippageInput" class="swal2-input" value="100" min="1" max="1000" style="width: 100%;" />
            <div style="font-size: 0.85em; color: #666;">100 = 1%, 500 = 5%</div>
          </div>
          
          <div style="margin-top: 20px; padding: 10px; background: #f0f0f0; border-radius: 5px; font-size: 0.9em;">
            <strong>Important:</strong>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>100% of staking yields go to BAY stakers</li>
              <li>Your principal is locked until unlock date</li>
              <li>Lido is well-audited but carries contract risk</li>
            </ul>
          </div>
        </div>
      `,
      width: '600px',
      showCancelButton: true,
      confirmButtonText: 'Deposit',
      cancelButtonText: 'Cancel',
      didOpen: () => {
        const depositTypeSelect = document.getElementById('depositType');
        const slippageSection = document.getElementById('slippageSection');
        const lockDaysInput = document.getElementById('lockDays');
        const lockEstimate = document.getElementById('lockEstimate');
        
        // Show/hide slippage based on deposit type
        depositTypeSelect.addEventListener('change', () => {
          if (depositTypeSelect.value === 'eth') {
            slippageSection.style.display = 'block';
          } else {
            slippageSection.style.display = 'none';
          }
        });
        
        // Trigger initial check
        if (depositTypeSelect.value === 'eth') {
          slippageSection.style.display = 'block';
        }
        
        // Update lock estimate
        lockDaysInput.addEventListener('input', () => {
          const days = parseInt(lockDaysInput.value) || 0;
          const months = Math.floor(days / 30);
          const years = Math.floor(days / 365);
          
          if (years > 0) {
            lockEstimate.textContent = `≈ ${years} year(s) ${Math.floor((days % 365) / 30)} month(s)`;
          } else if (months > 0) {
            lockEstimate.textContent = `≈ ${months} month(s)`;
          } else {
            lockEstimate.textContent = `${days} day(s)`;
          }
          
          if (hasExistingDeposit) {
            const unlockDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
            lockEstimate.textContent += ` (unlock: ${unlockDate.toLocaleDateString()})`;
          }
        });
      },
      preConfirm: () => {
        const depositType = document.getElementById('depositType').value;
        const amount = document.getElementById('depositAmount').value;
        const lockDays = document.getElementById('lockDays').value;
        const increment = hasExistingDeposit ? document.getElementById('incrementLock').checked : false;
        const slippage = depositType === 'eth' ? document.getElementById('slippageInput').value : 0;
        
        if (!amount || amount === '' || amount === '0') {
          Swal.showValidationMessage('Please enter a valid amount');
          return false;
        }
        
        if (!lockDays || parseInt(lockDays) < minDays || parseInt(lockDays) > maxDays) {
          Swal.showValidationMessage(`Lock days must be between ${minDays} and ${maxDays}`);
          return false;
        }
        
        return { depositType, amount, lockDays, increment, slippage };
      }
    });
    
    if (!result.isConfirmed) return;
    
    const { depositType, amount, lockDays, increment, slippage } = result.value;
    
    showSpinner();
    
    try {
      const BN = earnState.ethWeb3.utils.BN;
      const amountWei = earnState.ethWeb3.utils.toWei(amount, 'ether');
      
      if (depositType === 'eth') {
        // Show UniSwap/trading disclaimer
        const tradeDisclaimer = await Swal.fire({
          title: 'Trading Disclaimer',
          html: '<p>By proceeding, you acknowledge that cryptocurrency trading involves risks. Please review the transaction details carefully.</p>',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'I Understand',
          cancelButtonText: 'Cancel'
        });
        
        if (!tradeDisclaimer.isConfirmed) {
          hideSpinner();
          return;
        }
        
        // Deposit ETH (will be swapped to stETH via Curve)
        await lidoContract.methods.tradeAndLockStETH(slippage, lockDays, increment).send({
          from: myaccountsV2,
          value: amountWei,
          gas: 500000
        });
        
        Swal.fire('Success', 'ETH deposited and converted to stETH!', 'success');
      } else {
        // Deposit stETH
        const stETHContract = new earnState.ethWeb3.eth.Contract(
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
          TREASURY_ADDRESSES.LIDO_STETH
        );
        
        Swal.fire({
          icon: 'info',
          title: 'Allowance',
          text: 'Authorizing stETH allowance...',
          showConfirmButton: false
        });
        
        // Approve stETH
        await stETHContract.methods.approve(TREASURY_ADDRESSES.LIDO_VAULT, amountWei).send({
          from: myaccountsV2,
          gas: 100000
        });
        
        Swal.fire({
          icon: 'info',
          title: 'Depositing',
          text: 'Depositing stETH to vault...',
          showConfirmButton: false
        });
        
        // Deposit stETH
        await lidoContract.methods.lockStETH(amountWei, lockDays, increment).send({
          from: myaccountsV2,
          gas: 300000
        });
        
        Swal.fire('Success', 'stETH deposited successfully!', 'success');
      }
      
      hideSpinner();
      await refreshEarnTab();
      
    } catch (error) {
      hideSpinner();
      console.error('Error depositing to Lido HODL:', error);
      Swal.fire('Error', error.message || 'Deposit failed', 'error');
    }
    
  } catch (error) {
    console.error('Error in depositLidoHODL:', error);
    Swal.fire('Error', 'Failed to prepare deposit', 'error');
  }
}

async function withdrawLidoHODL() {
  if (!earnState.ethWeb3 || !myaccountsV2) {
    Swal.fire('Error', 'Please connect your wallet first', 'error');
    return;
  }
  
  try {
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    const userDeposit = await lidoContract.methods.deposits(myaccountsV2).call();
    
    const BN = earnState.ethWeb3.utils.BN;
    if (new BN(userDeposit.amount).lte(new BN('0'))) {
      Swal.fire('Error', 'You have no deposits to withdraw', 'error');
      return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const unlockTime = parseInt(userDeposit.unlockTimestamp);
    const isLocked = now < unlockTime;
    
    if (isLocked) {
      const unlockDate = new Date(unlockTime * 1000);
      Swal.fire({
        title: 'Funds Locked',
        html: `Your funds are locked until <strong>${unlockDate.toLocaleString()}</strong>`,
        icon: 'info'
      });
      return;
    }
    
    const amountETH = earnState.ethWeb3.utils.fromWei(userDeposit.amount, 'ether');
    
    const result = await Swal.fire({
      title: 'Withdraw from Lido HODL',
      html: `
        <div style="text-align: left;">
          <p><strong>Available to withdraw:</strong> ${amountETH} stETH</p>
          <label style="margin-top: 15px; display: block;">Amount to withdraw:</label>
          <input type="number" id="withdrawAmount" class="swal2-input" placeholder="${amountETH}" max="${amountETH}" step="0.001" style="width: 100%;" />
          <div style="margin-top: 10px; font-size: 0.9em; color: #666;">Leave empty or enter full amount to withdraw everything</div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Withdraw',
      cancelButtonText: 'Cancel',
      preConfirm: () => {
        const amount = document.getElementById('withdrawAmount').value;
        const BN = earnState.ethWeb3.utils.BN;
        const amountWei = userDeposit.amount; // Already in wei
        
        if (amount) {
          const inputWei = earnState.ethWeb3.utils.toWei(amount, 'ether');
          if (new BN(inputWei).lte(new BN('0')) || new BN(inputWei).gt(new BN(amountWei))) {
            Swal.showValidationMessage(`Amount must be between 0 and ${amountETH}`);
            return false;
          }
        }
        return amount || amountETH;
      }
    });
    
    if (!result.isConfirmed) return;
    
    const withdrawAmount = result.value;
    const withdrawAmountWei = earnState.ethWeb3.utils.toWei(withdrawAmount, 'ether');
    
    showSpinner();
    
    try {
      await lidoContract.methods.withdrawStETH(withdrawAmountWei).send({
        from: myaccountsV2,
        gas: 300000
      });
      
      hideSpinner();
      Swal.fire('Success', `Withdrew ${withdrawAmount} stETH successfully!`, 'success');
      await refreshEarnTab();
      
    } catch (error) {
      hideSpinner();
      console.error('Error withdrawing from Lido HODL:', error);
      Swal.fire('Error', error.message || 'Withdrawal failed', 'error');
    }
    
  } catch (error) {
    console.error('Error in withdrawLidoHODL:', error);
    Swal.fire('Error', 'Failed to prepare withdrawal', 'error');
  }
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
    const totalDAI = formatETHAmount(totalShares, 2);  // DAI has 18 decimals like ETH
    document.getElementById('stableTotalDAI').textContent = totalDAI;
    
    // Get current tick position
    const tickLower = await stableContract.methods.tickLower().call();
    const tickUpper = await stableContract.methods.tickUpper().call();
    document.getElementById('stableCurrentTick').textContent = `${tickLower} to ${tickUpper}`;
    
    // Check if position is in range using the contract's built-in function
    const isInRange = await stableContract.methods.isInRange().call();
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
    
    if (isGreaterThanZero(userShares)) {
      const BN = BigNumber;
      const userDAI = new BN(userShares).dividedBy('1e18').toFixed(2);
      const percent = new BN(userShares).dividedBy(totalShares).times(100).toFixed(4);
      
      document.getElementById('userStableDAI').textContent = stripZeros(userDAI);
      document.getElementById('userStablePercent').textContent = stripZeros(percent);
      
      // Calculate anticipated weekly profit (rough estimate)
      // This would be percent of weekly rewards minus commission
      document.getElementById('userStableWeeklyProfit').textContent = '0.00';
      
      // Get pending fees
      const feeVault = await stableContract.methods.feeVault().call();
      const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
      const pendingFees = await feeVaultContract.methods.pendingFees(myaccountsV2).call();
      
      const pendingDAI = new BN(pendingFees[0]).dividedBy('1e18').toFixed(2);
      const pendingUSDC = new BN(pendingFees[1]).dividedBy('1e6').toFixed(2);
      const totalPendingUSD = new BN(pendingDAI).plus(new BN(pendingUSDC)).toFixed(2);
      
      document.getElementById('userStablePendingFees').textContent = stripZeros(totalPendingUSD);
      document.getElementById('userStablePosition').classList.remove('hidden');
      
      // Check current sendTo setting and update dropdown
      const sendTo = await feeVaultContract.methods.sendTo(myaccountsV2).call();
      const dropdown = document.getElementById('stableProfitDestination');
      if (dropdown) {
        if (sendTo === '0x0000000000000000000000000000000000000000' || sendTo === myaccountsV2) {
          dropdown.value = 'user';
        } else if (sendTo.toLowerCase() === TREASURY_ADDRESSES.BAYL_DAI_UNISWAP.toLowerCase()) {
          dropdown.value = 'bayl';
        } else if (sendTo.toLowerCase() === TREASURY_ADDRESSES.BAYR_DAI_UNISWAP.toLowerCase()) {
          dropdown.value = 'bayr';
        }
      }
    }
  } catch (error) {
    console.error('Error loading user StableVault position:', error);
  }
}

async function depositStableVault() {
  if (!earnState.polWeb3 || !myaccountsV2) {
    Swal.fire('Error', 'Please connect your wallet first', 'error');
    return;
  }
  
  const amount = document.getElementById('stableDepositAmount').value;
  const profitDestination = document.getElementById('stableProfitDestination').value;
  
  const BN = BigNumber;
  if (!amount || new BN(amount).lte(new BN('0'))) {
    Swal.fire('Error', 'Please enter a valid DAI amount', 'error');
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
  
  try {
    showSpinner();
    
    const BN = earnState.polWeb3.utils.BN;
    const amountWei = earnState.polWeb3.utils.toWei(amount, 'ether');
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const feeVault = await stableContract.methods.feeVault().call();
    const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
    
    // Check current sendTo setting
    const currentSendTo = await feeVaultContract.methods.sendTo(myaccountsV2).call();
    let targetSendTo = myaccountsV2; // Default to user
    
    if (profitDestination === 'bayl') {
      targetSendTo = TREASURY_ADDRESSES.BAYL_DAI_UNISWAP;
    } else if (profitDestination === 'bayr') {
      targetSendTo = TREASURY_ADDRESSES.BAYR_DAI_UNISWAP;
    }
    
    // Only call changeSendTo if it's different from current setting
    const needsUpdate = currentSendTo === '0x0000000000000000000000000000000000000000' || 
                       currentSendTo.toLowerCase() !== targetSendTo.toLowerCase();
    
    if (needsUpdate && profitDestination !== 'user') {
      Swal.fire({
        icon: 'info',
        title: 'Setting Profit Destination',
        text: 'Configuring where your profits will be sent...',
        showConfirmButton: false
      });
      
      await feeVaultContract.methods.changeSendTo(targetSendTo).send({
        from: myaccountsV2,
        gas: 100000,
        gasPrice: gasPrice
      });
    }
    
    // Approve DAI
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
      TREASURY_ADDRESSES.DAI
    );
    
    Swal.fire({
      icon: 'info',
      title: 'Allowance',
      text: 'Authorizing DAI allowance...',
      showConfirmButton: false
    });
    
    await daiContract.methods.approve(TREASURY_ADDRESSES.STABLE_POOL, amountWei).send({
      from: myaccountsV2,
      gas: 100000,
      gasPrice: gasPrice
    });
    
    Swal.fire({
      icon: 'info',
      title: 'Depositing',
      text: 'Depositing DAI to StableVault...',
      showConfirmButton: false
    });
    
    // Deposit with 5 minute deadline
    const deadline = Math.floor(Date.now() / 1000) + 300;
    await stableContract.methods.deposit(amountWei, deadline).send({
      from: myaccountsV2,
      gas: 500000,
      gasPrice: gasPrice
    });
    
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
  if (!earnState.polWeb3 || !myaccountsV2) {
    Swal.fire('Error', 'Please connect your wallet first', 'error');
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
      const BN = BigNumber;
      if (!value || new BN(value).lte(new BN('0')) || new BN(value).gt(new BN('100'))) {
        return 'Please enter a valid percentage (1-100)';
      }
    }
  });
  
  if (!result.isConfirmed) return;
  
  try {
    showSpinner();
    
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const userShares = await stableContract.methods.shares(myaccountsV2).call();
    
    const BN = BigNumber;
    const withdrawPercent = new BN(result.value);
    const withdrawShares = new BN(userShares).times(withdrawPercent).div(new BN('100')).integerValue(BN.ROUND_DOWN);
    
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
  if (!earnState.stakingEnabled || !earnState.isPasswordLogin || !myaccountsV2) {
    return;
  }
  
  console.log('Checking staking conditions...');
  
  try {
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    const userInfo = await baylTreasury.methods.accessPool(myaccountsV2).call();
    
    // Check if user has any stake
    if (parseInt(userInfo.shares) === 0) {
      console.log('No stake, skipping automation');
      return;
    }
    
    // Check POL balance
    const polBalance = await earnState.polWeb3.eth.getBalance(myaccountsV2);
    const BN = BigNumber;
    const polBalanceEther = new BN(polBalance).dividedBy('1e18');
    
    if (polBalanceEther.lt(new BN('10'))) {
      console.log('POL balance too low, pausing staking');
      earnState.stakingEnabled = false;
      document.getElementById('stakingEnabledCheckbox').checked = false;
      localStorage.setItem('earnStakingEnabled', 'false');
      Swal.fire('Warning', 'Staking paused due to low POL balance (< 10)', 'warning');
      return;
    }
    
    // Check if user needs to refresh (if lastRefresh == 1, they are paused)
    if (userInfo.lastRefresh == 1 && parseInt(userInfo.shares) > 0) {
      console.log('User is paused, refreshing vault...');
      await baylTreasury.methods.refreshVault().send({
        from: myaccountsV2,
        gas: 300000,
        gasPrice: gasPrice
      });
      return;
    }
    
    // Calculate if we're 85% into the staking interval
    const currentBlock = await earnState.polWeb3.eth.getBlockNumber();
    const claimRate = await baylTreasury.methods.claimRate().call();
    const blocksSinceStake = currentBlock - userInfo.stakeBlock;
    const targetBlocks = Math.floor(parseInt(claimRate) * 0.85) + (earnState.randomDelaySeconds / 2); // ~2 sec per block on Polygon
    
    if (blocksSinceStake < targetBlocks) {
      console.log(`Not time to stake yet. Blocks since stake: ${blocksSinceStake}, target: ${targetBlocks}`);
      return;
    }
    
    console.log('Time to execute staking tasks!');
    
    // 1. Check Flow contract for pending ETH
    await checkAndDripFlow();
    
    // 2. Check Lido for yield to harvest
    await checkAndHarvestLido();
    
    // 3. Check StableVault position management
    await checkAndManageStableVault();
    
    // 4. Check for inactive users to update (once per week, max 4 at a time)
    await checkAndUpdateInactiveUsers();
    
    // 5. Claim own rewards
    await claimStakingRewards();
    
    // Reset random delay for next round
    earnState.randomDelaySeconds = Math.floor(Math.random() * 600);
    
  } catch (error) {
    console.error('Error in staking automation:', error);
  }
}

async function checkAndDripFlow() {
  try {
    const flowContract = new earnState.polWeb3.eth.Contract(flowABI, TREASURY_ADDRESSES.FLOW_BAYL);
    const pending = await flowContract.methods.pendingYield().call();
    
    if (isGreaterThanZero(pending)) {
      const pendingETH = displayETHAmount(pending, 6);
      logToConsole(`Flow contract has ${pendingETH} ETH pending, calling drip...`);
      
      const tx = await flowContract.methods.drip().send({
        from: myaccountsV2,
        gas: 200000,
        gasPrice: gasPrice
      });
      
      logToConsole(`Flow drip successful, tx: ${tx.transactionHash}`);
    }
  } catch (error) {
    console.error('Error checking/dripping flow:', error);
    logToConsole(`Error with flow drip: ${error.message}`);
  }
}

async function checkAndHarvestLido() {
  try {
    if (!earnState.ethWeb3) return;
    
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    const availableYield = await lidoContract.methods.availableYield().call();
    const BN = earnState.ethWeb3.utils.BN;
    
    // Check if yield exceeds 0.01 ETH
    if (new BN(availableYield).gt(new BN('10000000000000000'))) {
      // Check ETH balance for gas
      const ethBalance = await earnState.ethWeb3.eth.getBalance(myaccountsV2);
      const BN2 = BigNumber;
      const ethBalanceETH = new BN2(ethBalance).dividedBy('1e18');
      
      if (ethBalanceETH.lt(new BN2('0.01'))) {
        logToConsole('Not enough ETH gas to harvest Lido yield');
        document.getElementById('stakingEthGasWarning').classList.remove('hidden');
        return;
      }
      
      // Estimate gas cost
      const ethGasPrice = await earnState.ethWeb3.eth.getGasPrice();
      const estimatedGas = 300000;
      const gasCostWei = new BN(ethGasPrice).mul(new BN(estimatedGas));
      
      // Check if gas cost is less than 25% of available yield
      if (gasCostWei.mul(new BN('4')).lt(new BN(availableYield))) {
        // Check time since last collection based on balance
        const totalPrincipal = await lidoContract.methods.totalPrincipal().call();
        const principalETH = new BN2(totalPrincipal).dividedBy('1e18');
        const minimumTime = principalETH.gt(new BN2('5')) ? 7 * 24 * 60 * 60 : 30 * 24 * 60 * 60;
        
        const lastCollection = parseInt(localStorage.getItem('lidoLastCollection') || '0');
        const now = Math.floor(Date.now() / 1000);
        
        if (now - lastCollection > minimumTime) {
          const yieldETH = stripZeros(new BN2(availableYield).dividedBy('1e18').toFixed(4));
          logToConsole(`Harvesting ${yieldETH} ETH from Lido vault...`);
          
          const tx = await lidoContract.methods.harvestAndSwapToETH(100, 0).send({
            from: myaccountsV2,
            gas: estimatedGas,
            gasPrice: ethGasPrice
          });
          
          localStorage.setItem('lidoLastCollection', now.toString());
          logToConsole(`Lido harvest successful, tx: ${tx.transactionHash}`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking/harvesting Lido:', error);
    logToConsole(`Error with Lido harvest: ${error.message}`);
  }
}

async function checkAndManageStableVault() {
  try {
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const feeVault = await stableContract.methods.feeVault().call();
    const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
    
    // Part 1: Check if user is donating and has pending fees > $1
    const userShares = await feeVaultContract.methods.shares(myaccountsV2).call();
    
    if (isGreaterThanZero(userShares)) {
      const sendTo = await feeVaultContract.methods.sendTo(myaccountsV2).call();
      const isDonating = sendTo !== '0x0000000000000000000000000000000000000000' && 
                        sendTo.toLowerCase() !== myaccountsV2.toLowerCase();
      
      if (isDonating) {
        const pendingFees = await feeVaultContract.methods.pendingFees(myaccountsV2).call();
        const BN = BigNumber;
        const pendingDAI = new BN(pendingFees[0]).dividedBy('1e18');
        const pendingUSDC = new BN(pendingFees[1]).dividedBy('1e6');
        const totalPendingUSD = pendingDAI.plus(pendingUSDC);
        
        // Only collect if > $1
        if (totalPendingUSD.gt(new BN('1'))) {
          const lastFeeCollection = parseInt(localStorage.getItem('stableFeeLastCollection') || '0');
          const now = Math.floor(Date.now() / 1000);
          
          // Collect once per day
          if (now - lastFeeCollection > 86400) {
            logToConsole('Collecting personal fees from StableVault (donating user)');
            const deadline = now + 300;
            
            await stableContract.methods.collectFees(deadline).send({
              from: myaccountsV2,
              gas: 500000,
              gasPrice: gasPrice
            });
            
            localStorage.setItem('stableFeeLastCollection', now.toString());
            logToConsole(`Personal fees collected: $${stripZeros(totalPendingUSD.toFixed(2))}`);
          }
        }
      }
    }
    
    // Part 2: Check global unclaimed fees for the pool position (collective check)
    const liquidity = await stableContract.methods.liquidity().call();
    
    if (isGreaterThanZero(liquidity)) {
      const unclaimedFees = await stableContract.methods.getUnclaimedFees().call();
      const BN = BigNumber;
      const fee0 = new BN(unclaimedFees.fee0).dividedBy('1e18'); // DAI
      const fee1 = new BN(unclaimedFees.fee1).dividedBy('1e6'); // USDC
      const totalUnclaimedUSD = fee0.plus(fee1);
      
      // Only proceed if > $5 for the collective pool
      if (totalUnclaimedUSD.gt(new BN('5'))) {
        const now = Math.floor(Date.now() / 1000);
        const deadline = now + 300;
        
        logToConsole(`StableVault unclaimed fees: $${stripZeros(totalUnclaimedUSD.toFixed(2))}, collecting...`);
        
        await stableContract.methods.collectFees(deadline).send({
          from: myaccountsV2,
          gas: 500000,
          gasPrice: gasPrice
        });
        
        logToConsole('StableVault pool fees collected successfully');
      }
      
      // Check if position needs repositioning (if out of range)
      const isInRange = await stableContract.methods.isInRange().call();
      
      if (!isInRange) {
        const lastReposition = await stableContract.methods.lastReposition().call();
        const positionTimelock = await stableContract.methods.POSITION_TIMELOCK().call();
        const now = Math.floor(Date.now() / 1000);
        
        if (now - lastReposition > positionTimelock) {
          logToConsole('StableVault is out of range, repositioning...');
          const deadline = now + 300;
          
          await stableContract.methods.reposition(deadline).send({
            from: myaccountsV2,
            gas: 700000,
            gasPrice: gasPrice
          });
          
          logToConsole('StableVault repositioned successfully');
        }
      }
      
      // Check if dust needs cleaning
      const lastDustClean = await stableContract.methods.lastDustClean().call();
      const cleanTimelock = await stableContract.methods.CLEAN_TIMELOCK().call();
      const now = Math.floor(Date.now() / 1000);
      
      if (now - lastDustClean > cleanTimelock) {
        logToConsole('Cleaning StableVault dust...');
        const deadline = now + 300;
        
        await stableContract.methods.cleanDust(deadline).send({
          from: myaccountsV2,
          gas: 500000,
          gasPrice: gasPrice
        });
        
        logToConsole('StableVault dust cleaned successfully');
      }
    }
    
  } catch (error) {
    console.error('Error managing stable vault:', error);
    logToConsole(`Error managing StableVault: ${error.message}`);
  }
}

async function checkAndUpdateInactiveUsers() {
  try {
    // Only check once per week
    const lastCheck = parseInt(localStorage.getItem('inactiveUserLastCheck') || '0');
    const now = Math.floor(Date.now() / 1000);
    
    if (now - lastCheck < 7 * 24 * 60 * 60) {
      return;
    }
    
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    const topStakers = await baylTreasury.methods.getTopStakers().call();
    const claimRate = await baylTreasury.methods.claimRate().call();
    const currentBlock = await earnState.polWeb3.eth.getBlockNumber();
    
    let updated = 0;
    for (const staker of topStakers) {
      if (updated >= 4) break;
      
      if (staker.user === myaccountsV2) continue; // Skip self
      
      const userInfo = await baylTreasury.methods.accessPool(staker.user).call();
      const blocksSinceStake = currentBlock - userInfo.stakeBlock;
      
      // Check if user is inactive (more than 10x claim rate)
      if (blocksSinceStake > parseInt(claimRate) * 10) {
        logToConsole(`Updating inactive user: ${staker.user.substring(0, 10)}...`);
        
        const tx = await baylTreasury.methods.updateUser(staker.user).send({
          from: myaccountsV2,
          gas: 300000,
          gasPrice: gasPrice
        });
        
        logToConsole(`Inactive user updated, tx: ${tx.transactionHash}`);
        updated++;
      }
    }
    
    if (updated > 0) {
      localStorage.setItem('inactiveUserLastCheck', now.toString());
      logToConsole(`Updated ${updated} inactive user(s)`);
    }
    
  } catch (error) {
    console.error('Error updating inactive users:', error);
    logToConsole(`Error updating inactive users: ${error.message}`);
  }
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
    
    document.getElementById('baylTotalStaked').textContent = displayBAYAmount(totalTokens, 2);
    document.getElementById('baylTotalShares').textContent = totalShares;
    document.getElementById('baylRefreshRate').textContent = 
      Math.floor(refreshRate / 86400) + ' days';
    document.getElementById('baylClaimRate').textContent = claimRate + ' blocks';
    
    // Load user staking info
    const userInfo = await baylTreasury.methods.accessPool(myaccountsV2).call();
    document.getElementById('userShares').textContent = displayBAYAmount(userInfo.shares, 2);
    
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
        if (isGreaterThanZero(pending)) {
          let coinName = coin.substring(0, 10) + '...';
          let pendingDisplay = '';
          if (coin.toLowerCase() === '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'.toLowerCase()) {
            coinName = 'WETH';
            pendingDisplay = displayETHAmount(pending, 6);
          } else if (coin.toLowerCase() === '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'.toLowerCase()) {
            coinName = 'DAI';
            pendingDisplay = displayETHAmount(pending, 6);
          } else if (coin.toLowerCase() === TREASURY_ADDRESSES.USDC.toLowerCase()) {
            coinName = 'USDC';
            pendingDisplay = displayUSDCAmount(pending, 6);
          }
          
          rewardsHTML += `<div>${coinName}: ${pendingDisplay}</div>`;
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
      
      document.getElementById('vaultBaylBalance').textContent = displayBAYAmount(baylBalance, 2);
      document.getElementById('vaultBayrBalance').textContent = displayBAYAmount(bayrBalance, 2);
      
      document.getElementById('vaultBalances').classList.remove('hidden');
    }
    
    document.getElementById('userStakingInfo').classList.remove('hidden');
    
    // Check POL balance for gas warning
    const polBalance = await earnState.polWeb3.eth.getBalance(myaccountsV2);
    const BN = BigNumber;
    const polBalanceEther = new BN(polBalance).dividedBy('1e18');
    
    if (polBalanceEther.lt(new BN('30'))) {
      document.getElementById('stakingPolBalance').textContent = stripZeros(polBalanceEther.toFixed(2));
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
      if (isGreaterThanZero(staker.shares)) {
        html += `<li>${staker.user.substring(0, 10)}...: ${displayBAYAmount(staker.shares, 2)} BAYL</li>`;
      }
    }
    html += '</ol>';
    
    document.getElementById('topStakersList').innerHTML = html || '<p>No stakers yet</p>';
    
  } catch (error) {
    console.error('Error loading top stakers:', error);
  }
}

async function depositStake() {
  if (!earnState.polWeb3 || !myaccountsV2 || loginType !== 2) {
    Swal.fire('Error', 'Please login with password to stake', 'error');
    return;
  }
  
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
  
  const BN = BigNumber;
  if (!amount || new BN(amount).lte(new BN('0'))) {
    Swal.fire('Error', 'Please enter a valid amount', 'error');
    return;
  }
  
  try {
    showSpinner();
    
    const amountWei = earnState.polWeb3.utils.toWei(amount, 'ether');
    const vaultContract = new earnState.polWeb3.eth.Contract(vaultABI, TREASURY_ADDRESSES.VAULT);
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    
    // Check if this is first deposit - if so, set coins first
    const userInfo = await baylTreasury.methods.accessPool(myaccountsV2).call();
    const userCoins = await baylTreasury.methods.getUserCoins(myaccountsV2).call();
    
    if (!userCoins || userCoins.length === 0) {
      // Set default coins: WETH, DAI, USDC
      const coins = [
        '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH on Polygon
        '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', // DAI on Polygon
        TREASURY_ADDRESSES.USDC
      ];
      
      await baylTreasury.methods.setCoins(coins).send({
        from: myaccountsV2,
        gas: 200000,
        gasPrice: gasPrice
      });
    }
    
    // Get BAYL address
    const baylAddress = await vaultContract.methods.BAYL().call();
    const baylContract = new earnState.polWeb3.eth.Contract(
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
      baylAddress
    );
    
    // Approve BAYL to vault
    await baylContract.methods.approve(TREASURY_ADDRESSES.VAULT, amountWei).send({
      from: myaccountsV2,
      gas: 100000,
      gasPrice: gasPrice
    });
    
    // Deposit to vault (which will stake to treasury)
    await vaultContract.methods.depositBAYL(amountWei).send({
      from: myaccountsV2,
      gas: 500000,
      gasPrice: gasPrice
    });
    
    hideSpinner();
    Swal.fire('Success', 'BAYL staked successfully!', 'success');
    await refreshEarnTab();
    
  } catch (error) {
    hideSpinner();
    console.error('Error staking BAYL:', error);
    Swal.fire('Error', error.message || 'Staking failed', 'error');
  }
}

async function unstakeBAYL() {
  if (!earnState.polWeb3 || !myaccountsV2 || loginType !== 2) {
    Swal.fire('Error', 'Please login with password to unstake', 'error');
    return;
  }
  
  const result = await Swal.fire({
    title: 'Unstake BAYL',
    input: 'number',
    inputLabel: 'Amount to unstake',
    inputPlaceholder: '0.0',
    showCancelButton: true,
    inputValidator: (value) => {
      const BN = BigNumber;
      if (!value || new BN(value).lte(new BN('0'))) {
        return 'Please enter a valid amount';
      }
    }
  });
  
  if (!result.isConfirmed) return;
  
  try {
    showSpinner();
    
    const amountWei = earnState.polWeb3.utils.toWei(result.value, 'ether');
    const vaultContract = new earnState.polWeb3.eth.Contract(vaultABI, TREASURY_ADDRESSES.VAULT);
    
    await vaultContract.methods.withdrawBAYL(amountWei).send({
      from: myaccountsV2,
      gas: 500000,
      gasPrice: gasPrice
    });
    
    hideSpinner();
    Swal.fire('Success', 'BAYL unstaked successfully!', 'success');
    await refreshEarnTab();
    
  } catch (error) {
    hideSpinner();
    console.error('Error unstaking BAYL:', error);
    Swal.fire('Error', error.message || 'Unstaking failed', 'error');
  }
}

async function claimStakingRewards() {
  if (!earnState.polWeb3 || !myaccountsV2 || loginType !== 2) {
    Swal.fire('Error', 'Please login with password to claim rewards', 'error');
    return;
  }
  
  try {
    showSpinner();
    
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    
    // Get user's saved votes
    const savedVotes = JSON.parse(localStorage.getItem('earnUserVotes') || '[]');
    const votesToCast = [];
    
    for (const vote of savedVotes) {
      if (vote.timesCast < vote.repeat) {
        // Build the vote payload array per StakingVote.sol _executePayload spec
        // payload[0] = abi.encode(uint256(0))  // opcode
        // payload[1] = abi.encode(string("functionName(type)"))  // function signature
        // payload[2] = abi.encode(address(targetContract))  // target address
        // payload[3+] = encoded arguments (raw bytes, not double-encoded)
        
        for (const func of vote.functions) {
          try {
            const payload = [];
            
            // Element 0: opcode (uint256 = 0)
            payload.push(earnState.polWeb3.eth.abi.encodeParameter('uint256', '0'));
            
            // Element 1: function signature as string
            payload.push(earnState.polWeb3.eth.abi.encodeParameter('string', func.signature));
            
            // Element 2: target contract address
            payload.push(earnState.polWeb3.eth.abi.encodeParameter('address', vote.targetContract));
            
            // Element 3+: encode the argument(s) individually
            payload.push(earnState.polWeb3.eth.abi.encodeParameter(func.paramType, func.paramValue));
            
            votesToCast.push(payload);
          } catch (e) {
            console.error('Error encoding vote:', e);
          }
        }
        
        // Increment times cast
        vote.timesCast++;
      }
    }
    
    // Save updated vote counts
    localStorage.setItem('earnUserVotes', JSON.stringify(savedVotes));
    
    // Claim rewards with votes (as bytes[][] array)
    await baylTreasury.methods.claimRewards(TREASURY_ADDRESSES.VOTE_BAYL, votesToCast).send({
      from: myaccountsV2,
      gas: 700000,
      gasPrice: gasPrice
    });
    
    // Update total rewards in localStorage
    const userCoins = await baylTreasury.methods.getUserCoins(myaccountsV2).call();
    for (const coin of userCoins) {
      let coinName = 'Unknown';
      if (coin.toLowerCase() === '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'.toLowerCase()) coinName = 'WETH';
      if (coin.toLowerCase() === '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'.toLowerCase()) coinName = 'DAI';
      if (coin.toLowerCase() === TREASURY_ADDRESSES.USDC.toLowerCase()) coinName = 'USDC';
      
      const pending = await baylTreasury.methods.getPendingReward(myaccountsV2, coin).call();
      if (parseInt(pending) > 0) {
        const BN = BigNumber;
        let amount;
        if (coinName === 'USDC') {
          amount = new BN(pending).dividedBy('1e6').toNumber();
        } else {
          amount = new BN(pending).dividedBy('1e18').toNumber();
        }
        earnState.userTotalRewards[coinName] = (earnState.userTotalRewards[coinName] || 0) + amount;
      }
    }
    
    localStorage.setItem('earnTotalRewards', JSON.stringify(earnState.userTotalRewards));
    
    hideSpinner();
    
    let message = 'Rewards claimed successfully!';
    if (votesToCast.length > 0) {
      message += ` ${votesToCast.length} vote(s) cast.`;
    }
    
    Swal.fire('Success', message, 'success');
    await refreshEarnTab();
    
  } catch (error) {
    hideSpinner();
    console.error('Error claiming rewards:', error);
    Swal.fire('Error', error.message || 'Claiming rewards failed', 'error');
  }
}

// ============================================================================
// VOTING FUNCTIONS
// ============================================================================

async function loadVotingInfo() {
  if (!earnState.polWeb3) return;
  
  try {
    const voteContract = new earnState.polWeb3.eth.Contract(stakingABI, TREASURY_ADDRESSES.VOTE_BAYL);
    
    // Get current epoch
    const currentEpoch = await voteContract.methods.currentEpoch().call();
    document.getElementById('currentVoteEpoch').textContent = currentEpoch;
    
    // Get epoch block info
    const epochBlocks = await voteContract.methods.epochLength().call();
    document.getElementById('voteEpochBlocks').textContent = epochBlocks;
    
    // Load previous and pending votes
    await loadVotes(voteContract, currentEpoch);
    
  } catch (error) {
    console.error('Error loading voting info:', error);
  }
}

async function loadVotes(voteContract, currentEpoch) {
  try {
    // For previous epoch: Only show winner and its votes
    if (currentEpoch > 0) {
      const prevEpoch = currentEpoch - 1;
      const winningHash = await voteContract.methods.winningHash(prevEpoch).call();
      let prevHTML = '';
      
      if (winningHash && winningHash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        const weight = await voteContract.methods.winningWeight(prevEpoch).call();
        const payload = await voteContract.methods.getProposalPayload(winningHash).call();
        prevHTML += `<div><strong>Winner:</strong> <a href="#" onclick="showVotePayload('${winningHash}')">${winningHash.substring(0, 10)}...</a> (${weight} votes)</div>`;
      } else {
        prevHTML = 'No votes in last epoch';
      }
      document.getElementById('baylPreviousVotes').innerHTML = prevHTML;
    }
    
    // For current epoch: Show top 5 hashes (getEpochHashes)
    const topHashes = await voteContract.methods.getEpochHashes(currentEpoch).call();
    let pendingHTML = '';
    
    for (const hash of topHashes) {
      if (hash && hash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        pendingHTML += `<div><a href="#" onclick="showVotePayload('${hash}')">${hash.substring(0, 10)}...</a></div>`;
      }
    }
    
    if (pendingHTML === '') {
      pendingHTML = 'No pending votes';
    }
    document.getElementById('baylPendingVotes').innerHTML = pendingHTML;
    
  } catch (error) {
    console.error('Error loading votes:', error);
  }
}

function showCreateVoteDialog() {
  // Load any saved votes from localStorage
  const savedVotes = JSON.parse(localStorage.getItem('earnUserVotes') || '[]');
  
  Swal.fire({
    title: 'Create New Vote',
    html: `
      <div style="text-align: left; font-size: 0.9em;">
        <p style="margin-bottom: 10px; font-size: 0.85em;">Create a vote with function calls to execute if it passes.</p>
        
        <div style="margin-bottom: 10px;">
          <label style="font-size: 0.85em;"><strong>Target Contract:</strong></label>
          <input type="text" id="voteTargetContract" class="swal2-input" style="padding: 5px; font-size: 0.85em;" placeholder="0x..." />
        </div>
        
        <div id="voteFunctions">
          <div class="vote-function-item">
            <label style="font-size: 0.85em;">Function Signature:</label>
            <input type="text" id="funcSig0" class="swal2-input" style="padding: 5px; font-size: 0.85em;" placeholder="e.g., setMinDays(uint256)" />
            
            <label style="font-size: 0.85em;">Param Type:</label>
            <select id="paramType0" class="swal2-select" style="padding: 5px; font-size: 0.85em;">
              <option value="uint256">uint256</option>
              <option value="string">string</option>
              <option value="bytes">bytes</option>
              <option value="address">address</option>
            </select>
            
            <label style="font-size: 0.85em;">Param Value:</label>
            <input type="text" id="paramValue0" class="swal2-input" style="padding: 5px; font-size: 0.85em;" placeholder="Enter value" />
          </div>
        </div>
        
        <button onclick="addVoteFunction()" class="swal2-confirm swal2-styled" style="margin-top: 8px; padding: 5px 10px; font-size: 0.85em;">+ Add Function</button>
        
        <div style="margin-top: 10px;">
          <label style="font-size: 0.85em;">Repeat (max 10):</label>
          <input type="number" id="voteRepeat" class="swal2-input" style="padding: 5px; font-size: 0.85em;" value="1" min="1" max="10" />
        </div>
      </div>
    `,
    width: '500px',
    showCancelButton: true,
    confirmButtonText: 'Create Vote',
    cancelButtonText: 'Cancel',
    preConfirm: () => {
      return createVoteFromDialog();
    }
  });
}

function addVoteFunction() {
  const container = document.getElementById('voteFunctions');
  const index = container.children.length;
  
  if (index >= 10) {
    Swal.showValidationMessage('Maximum 10 functions per vote');
    return;
  }
  
  const newFunction = document.createElement('div');
  newFunction.className = 'vote-function-item';
  newFunction.style.marginTop = '10px';
  newFunction.style.borderTop = '1px solid #ccc';
  newFunction.style.paddingTop = '8px';
  newFunction.innerHTML = `
    <label style="font-size: 0.85em;">Function Signature:</label>
    <input type="text" id="funcSig${index}" class="swal2-input" style="padding: 5px; font-size: 0.85em;" placeholder="e.g., setMaxDays(uint256)" />
    
    <label style="font-size: 0.85em;">Param Type:</label>
    <select id="paramType${index}" class="swal2-select" style="padding: 5px; font-size: 0.85em;">
      <option value="uint256">uint256</option>
      <option value="string">string</option>
      <option value="bytes">bytes</option>
      <option value="address">address</option>
    </select>
    
    <label style="font-size: 0.85em;">Param Value:</label>
    <input type="text" id="paramValue${index}" class="swal2-input" style="padding: 5px; font-size: 0.85em;" placeholder="Enter value" />
  `;
  
  container.appendChild(newFunction);
}

function createVoteFromDialog() {
  const targetContract = document.getElementById('voteTargetContract').value;
  
  if (!targetContract || !targetContract.match(/^0x[a-fA-F0-9]{40}$/)) {
    Swal.showValidationMessage('Please enter a valid target contract address');
    return false;
  }
  
  const container = document.getElementById('voteFunctions');
  const numFunctions = container.children.length;
  const functions = [];
  
  for (let i = 0; i < numFunctions; i++) {
    const sig = document.getElementById(`funcSig${i}`).value;
    const type = document.getElementById(`paramType${i}`).value;
    const value = document.getElementById(`paramValue${i}`).value;
    
    if (!sig || !value) {
      Swal.showValidationMessage(`Please fill all fields for function ${i + 1}`);
      return false;
    }
    
    functions.push({ signature: sig, paramType: type, paramValue: value });
  }
  
  const repeat = parseInt(document.getElementById('voteRepeat').value);
  if (repeat < 1 || repeat > 10) {
    Swal.showValidationMessage('Repeat count must be between 1 and 10');
    return false;
  }
  
  // Save to localStorage with target contract
  const savedVotes = JSON.parse(localStorage.getItem('earnUserVotes') || '[]');
  const newVote = {
    id: Date.now(),
    targetContract: targetContract,
    functions: functions,
    repeat: repeat,
    timesCast: 0
  };
  savedVotes.push(newVote);
  localStorage.setItem('earnUserVotes', JSON.stringify(savedVotes));
  
  Swal.fire('Success', 'Vote created! It will be cast during your next reward claim.', 'success');
  return true;
}

function showVoteDetailsDialog() {
  const savedVotes = JSON.parse(localStorage.getItem('earnUserVotes') || '[]');
  
  let html = '<div style="text-align: left;">';
  
  if (savedVotes.length === 0) {
    html += '<p>You have not created any votes yet.</p>';
  } else {
    html += '<p><strong>Your Created Votes:</strong></p>';
    savedVotes.forEach((vote, index) => {
      html += `<div style="margin-bottom: 20px; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">`;
      html += `<p><strong>Vote ${index + 1}</strong> (Cast ${vote.timesCast}/${vote.repeat} times)</p>`;
      html += `<p><strong>Target Contract:</strong> ${vote.targetContract || 'N/A'}</p>`;
      html += '<ul>';
      vote.functions.forEach(func => {
        html += `<li><strong>Function:</strong> ${func.signature}</li>`;
        html += `<li style="margin-left: 20px;"><strong>Parameter:</strong> ${func.paramValue} (${func.paramType})</li>`;
      });
      html += '</ul>';
      html += `<button onclick="deleteVote(${vote.id})" class="swal2-cancel swal2-styled">Delete</button>`;
      html += `</div>`;
    });
  }
  
  html += '</div>';
  
  Swal.fire({
    title: 'Your Votes',
    html: html,
    width: '600px',
    confirmButtonText: 'Close'
  });
}

function deleteVote(voteId) {
  const savedVotes = JSON.parse(localStorage.getItem('earnUserVotes') || '[]');
  const filtered = savedVotes.filter(v => v.id !== voteId);
  localStorage.setItem('earnUserVotes', JSON.stringify(filtered));
  Swal.close();
  showVoteDetailsDialog();
}

// ============================================================================
// ROI CALCULATION
// ============================================================================

async function calculateAndDisplayROI() {
  if (!earnState.polWeb3) return;
  
  try {
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    const totalTokens = await baylTreasury.methods.totalTokens().call();
    
    // Only calculate if there's actual stake
    if (parseInt(totalTokens) === 0) {
      document.getElementById('earnRoiDisplay').classList.add('hidden');
      return;
    }
    
    // Get total weekly rewards across all coins
    const currentWeek = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    
    // We need to get WETH, DAI, and USDC prices from Chainlink or similar
    // For now, use approximate values:
    // WETH ~= $2000 (would need to fetch from Chainlink)
    // DAI ~= $1
    // USDC ~= $1
    
    const wethPrice = 2000; // TODO: Fetch from Chainlink
    const daiPrice = 1;
    const usdcPrice = 1;
    
    // Get weekly rewards for each coin
    const wethAddress = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619';
    const daiAddress = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063';
    const usdcAddress = TREASURY_ADDRESSES.USDC;
    
    const wethRewards = await baylTreasury.methods.weeklyRewards(currentWeek, wethAddress).call();
    const daiRewards = await baylTreasury.methods.weeklyRewards(currentWeek, daiAddress).call();
    const usdcRewards = await baylTreasury.methods.weeklyRewards(currentWeek, usdcAddress).call();
    
    const BN = BigNumber;
    const wethRewardsEther = new BN(wethRewards).dividedBy('1e18').toNumber();
    const daiRewardsEther = new BN(daiRewards).dividedBy('1e18').toNumber();
    const usdcRewardsFormatted = new BN(usdcRewards).dividedBy('1e6').toNumber();
    
    const weeklyRewardsUSD = (wethRewardsEther * wethPrice) + (daiRewardsEther * daiPrice) + (usdcRewardsFormatted * usdcPrice);
    const yearlyRewardsUSD = weeklyRewardsUSD * 52;
    
    // Get BAY price from UniSwap (or use approximate)
    // For simplicity, assume BAYL price ~= $0.10 (would need to fetch from pair)
    const bayPrice = 0.10; // TODO: Fetch from UniSwap pair
    
    const totalStakedUSD = new BN(totalTokens).dividedBy('1e8').toNumber() * bayPrice;
    
    if (totalStakedUSD > 0) {
      const yearlyROI = (yearlyRewardsUSD / totalStakedUSD) * 100;
      
      // Only display if ROI > 5%
      if (yearlyROI > 5) {
        document.getElementById('earnRoiText').textContent = 
          `📈 Yearly Staking ROI: ${stripZeros(yearlyROI.toFixed(2))}% (Based on current week rewards)`;
        document.getElementById('earnRoiDisplay').classList.remove('hidden');
      } else {
        document.getElementById('earnRoiDisplay').classList.add('hidden');
      }
    }
    
  } catch (error) {
    console.error('Error calculating ROI:', error);
  }
}

// ============================================================================
// REFRESH FUNCTIONS
// ============================================================================

async function loadTokenBalances() {
  if (!earnState.polWeb3 || !myaccountsV2) return;
  
  try {
    const BN = BigNumber;
    const balances = {}; // Store all balances for notification
    
    // Load DAI balance
    const daiContract = new earnState.polWeb3.eth.Contract(
      [{
        "constant": true,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
      }],
      TREASURY_ADDRESSES.DAI // DAI on Polygon
    );
    
    const daiBalance = await daiContract.methods.balanceOf(myaccountsV2).call();
    const daiBalanceEther = new BN(daiBalance).dividedBy('1e18');
    
    if (daiBalanceEther.gt(new BN('0'))) {
      document.getElementById('daiBalanceAmount').textContent = stripZeros(daiBalanceEther.toFixed(2));
      document.getElementById('daiBalance').classList.remove('hidden');
      balances.DAI = stripZeros(daiBalanceEther.toFixed(2));
    }
    
    // Load USDC balance
    const usdcContract = new earnState.polWeb3.eth.Contract(
      [{
        "constant": true,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
      }],
      TREASURY_ADDRESSES.USDC
    );
    
    const usdcBalance = await usdcContract.methods.balanceOf(myaccountsV2).call();
    const usdcBalanceFormatted = new BN(usdcBalance).dividedBy('1e6');
    
    if (usdcBalanceFormatted.gt(new BN('0'))) {
      document.getElementById('usdcBalanceAmount').textContent = stripZeros(usdcBalanceFormatted.toFixed(2));
      document.getElementById('usdcBalance').classList.remove('hidden');
      balances.USDC = stripZeros(usdcBalanceFormatted.toFixed(2));
    }
    
    // Load WETH balance
    const wethContract = new earnState.polWeb3.eth.Contract(
      [{
        "constant": true,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
      }],
      TREASURY_ADDRESSES.WETH
    );
    
    const wethBalance = await wethContract.methods.balanceOf(myaccountsV2).call();
    const wethBalanceFormatted = new BN(wethBalance).dividedBy('1e18');
    
    if (wethBalanceFormatted.gt(new BN('0'))) {
      document.getElementById('wethBalanceAmount').textContent = stripZeros(wethBalanceFormatted.toFixed(4));
      document.getElementById('wethBalance').classList.remove('hidden');
      balances.WETH = stripZeros(wethBalanceFormatted.toFixed(4));
    }
    
    // Load POL balance
    const polBalance = await earnState.polWeb3.eth.getBalance(myaccountsV2);
    const polBalanceFormatted = new BN(polBalance).dividedBy('1e18');
    
    if (polBalanceFormatted.gt(new BN('0'))) {
      document.getElementById('polBalanceAmount').textContent = stripZeros(polBalanceFormatted.toFixed(2));
      document.getElementById('polBalance').classList.remove('hidden');
      balances.POL = stripZeros(polBalanceFormatted.toFixed(2));
    }
    
    // Store balances for potential notification in main page
    if (Object.keys(balances).length > 0) {
      localStorage.setItem('earnTabBalances', JSON.stringify(balances));
      // Show withdraw button if any balances exist
      document.getElementById('withdrawCoinsSection').classList.remove('hidden');
    }
    
  } catch (error) {
    console.error('Error loading token balances:', error);
  }
}

// ============================================================================
// DEPOSIT ADDRESS AND WITHDRAWAL FUNCTIONS
// ============================================================================

function copyDepositAddress(coinType) {
  if (!myaccountsV2) {
    Swal.fire('Error', 'Please connect your wallet first', 'error');
    return;
  }
  
  const address = myaccountsV2;
  
  // Copy to clipboard
  navigator.clipboard.writeText(address).then(() => {
    Swal.fire({
      title: `${coinType} Deposit Address`,
      html: `
        <p>Address copied to clipboard!</p>
        <p style="word-break: break-all; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 5px;">
          ${address}
        </p>
        <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
          ${coinType === 'ETH' || coinType === 'Lido' ? 'Network: Ethereum Mainnet' : 'Network: Polygon'}
        </p>
      `,
      icon: 'success',
      confirmButtonText: 'OK'
    });
  }).catch(() => {
    Swal.fire({
      title: `${coinType} Deposit Address`,
      html: `
        <p style="word-break: break-all; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 5px;">
          ${address}
        </p>
        <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
          ${coinType === 'ETH' || coinType === 'Lido' ? 'Network: Ethereum Mainnet' : 'Network: Polygon'}
        </p>
      `,
      icon: 'info',
      confirmButtonText: 'OK'
    });
  });
}

async function showWithdrawDialog() {
  if (!earnState.polWeb3 || !myaccountsV2) {
    Swal.fire('Error', 'Please connect your wallet first', 'error');
    return;
  }
  
  // Get available balances
  const balances = [];
  
  try {
    const BN = BigNumber;
    
    // Check POL balance
    const polBalance = await earnState.polWeb3.eth.getBalance(myaccountsV2);
    const polBalanceFormatted = new BN(polBalance).dividedBy('1e18');
    if (polBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'POL', balance: stripZeros(polBalanceFormatted.toFixed(4)), network: 'Polygon' });
    }
    
    // Check USDC balance
    const usdcContract = new earnState.polWeb3.eth.Contract(
      [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
      TREASURY_ADDRESSES.USDC
    );
    const usdcBalance = await usdcContract.methods.balanceOf(myaccountsV2).call();
    const usdcBalanceFormatted = new BN(usdcBalance).dividedBy('1e6');
    if (usdcBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'USDC', balance: stripZeros(usdcBalanceFormatted.toFixed(2)), network: 'Polygon' });
    }
    
    // Check DAI balance
    const daiContract = new earnState.polWeb3.eth.Contract(
      [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
      TREASURY_ADDRESSES.DAI
    );
    const daiBalance = await daiContract.methods.balanceOf(myaccountsV2).call();
    const daiBalanceFormatted = new BN(daiBalance).dividedBy('1e18');
    if (daiBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'DAI', balance: stripZeros(daiBalanceFormatted.toFixed(2)), network: 'Polygon' });
    }
    
    // Check WETH balance
    const wethContract = new earnState.polWeb3.eth.Contract(
      [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
      TREASURY_ADDRESSES.WETH
    );
    const wethBalance = await wethContract.methods.balanceOf(myaccountsV2).call();
    const wethBalanceFormatted = new BN(wethBalance).dividedBy('1e18');
    if (wethBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'WETH', balance: stripZeros(wethBalanceFormatted.toFixed(4)), network: 'Polygon' });
    }
    
    // Check Ethereum balances if available
    if (earnState.ethWeb3) {
      const ethBalance = await earnState.ethWeb3.eth.getBalance(myaccountsV2);
      const ethBalanceFormatted = new BN(ethBalance).dividedBy('1e18');
      if (ethBalanceFormatted.gt(new BN('0'))) {
        balances.push({ coin: 'ETH', balance: stripZeros(ethBalanceFormatted.toFixed(4)), network: 'Ethereum' });
      }
      
      // Check Lido stETH balance
      const stETHContract = new earnState.ethWeb3.eth.Contract(
        [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
        TREASURY_ADDRESSES.LIDO_STETH
      );
      const stETHBalance = await stETHContract.methods.balanceOf(myaccountsV2).call();
      const stETHBalanceFormatted = new BN(stETHBalance).dividedBy('1e18');
      if (stETHBalanceFormatted.gt(new BN('0'))) {
        balances.push({ coin: 'stETH (Lido)', balance: stripZeros(stETHBalanceFormatted.toFixed(4)), network: 'Ethereum' });
      }
    }
    
    if (balances.length === 0) {
      Swal.fire('Info', 'No available balances to withdraw', 'info');
      return;
    }
    
    // Build options HTML
    const optionsHTML = balances.map((b, idx) => 
      `<option value="${idx}">${b.coin} - ${b.balance} (${b.network})</option>`
    ).join('');
    
    const result = await Swal.fire({
      title: 'Withdraw Coins',
      html: `
        <div style="text-align: left;">
          <label style="display: block; margin-bottom: 5px;">Select coin to withdraw:</label>
          <select id="withdrawCoinSelect" class="swal2-select" style="width: 100%;">
            ${optionsHTML}
          </select>
          
          <label style="display: block; margin-top: 15px; margin-bottom: 5px;">Amount to withdraw:</label>
          <input type="number" id="withdrawAmount" class="swal2-input" placeholder="Enter amount" step="0.0001" style="width: 100%;" />
          
          <label style="display: block; margin-top: 15px; margin-bottom: 5px;">Recipient address:</label>
          <input type="text" id="withdrawAddress" class="swal2-input" placeholder="0x..." style="width: 100%;" />
          
          <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
            Leave amount empty to withdraw full balance
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Withdraw',
      cancelButtonText: 'Cancel',
      preConfirm: () => {
        const coinIdx = parseInt(document.getElementById('withdrawCoinSelect').value);
        const amount = document.getElementById('withdrawAmount').value;
        const address = document.getElementById('withdrawAddress').value;
        
        if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
          Swal.showValidationMessage('Please enter a valid Ethereum address');
          return false;
        }
        
        return { coin: balances[coinIdx], amount, address };
      }
    });
    
    if (result.isConfirmed) {
      await executeWithdrawal(result.value);
    }
    
  } catch (error) {
    console.error('Error in withdraw dialog:', error);
    Swal.fire('Error', 'Failed to load balances: ' + error.message, 'error');
  }
}

async function executeWithdrawal(withdrawData) {
  const { coin, amount, address } = withdrawData;
  
  showSpinner();
  
  try {
    const BN = BigNumber;
    const gasPrice = await earnState.polWeb3.eth.getGasPrice();
    
    if (coin.coin === 'POL') {
      // Withdraw POL
      const balance = await earnState.polWeb3.eth.getBalance(myaccountsV2);
      let amountWei;
      
      if (amount) {
        amountWei = earnState.polWeb3.utils.toWei(amount, 'ether');
      } else {
        // Reserve gas for transaction when withdrawing full balance
        const gasCost = new BN(gasPrice).times(21000);
        amountWei = new BN(balance).minus(gasCost).toFixed(0);
        
        if (new BN(amountWei).lte(new BN('0'))) {
          throw new Error('Insufficient balance to cover gas fees');
        }
      }
      
      await earnState.polWeb3.eth.sendTransaction({
        from: myaccountsV2,
        to: address,
        value: amountWei,
        gas: 21000,
        gasPrice: gasPrice
      });
      
    } else if (coin.coin === 'ETH') {
      // Withdraw ETH
      const balance = await earnState.ethWeb3.eth.getBalance(myaccountsV2);
      const ethGasPrice = await earnState.ethWeb3.eth.getGasPrice();
      let amountWei;
      
      if (amount) {
        amountWei = earnState.ethWeb3.utils.toWei(amount, 'ether');
      } else {
        // Reserve gas for transaction when withdrawing full balance
        const gasCost = new BN(ethGasPrice).times(21000);
        amountWei = new BN(balance).minus(gasCost).toFixed(0);
        
        if (new BN(amountWei).lte(new BN('0'))) {
          throw new Error('Insufficient balance to cover gas fees');
        }
      }
      
      await earnState.ethWeb3.eth.sendTransaction({
        from: myaccountsV2,
        to: address,
        value: amountWei,
        gas: 21000,
        gasPrice: ethGasPrice
      });
      
    } else {
      // Withdraw ERC20 token
      let tokenAddress, decimals, web3Instance;
      
      if (coin.coin === 'USDC') {
        tokenAddress = TREASURY_ADDRESSES.USDC;
        decimals = '1e6';
        web3Instance = earnState.polWeb3;
      } else if (coin.coin === 'DAI') {
        tokenAddress = TREASURY_ADDRESSES.DAI;
        decimals = '1e18';
        web3Instance = earnState.polWeb3;
      } else if (coin.coin === 'WETH') {
        tokenAddress = TREASURY_ADDRESSES.WETH;
        decimals = '1e18';
        web3Instance = earnState.polWeb3;
      } else if (coin.coin === 'stETH (Lido)') {
        tokenAddress = TREASURY_ADDRESSES.LIDO_STETH;
        decimals = '1e18';
        web3Instance = earnState.ethWeb3;
      }
      
      const tokenContract = new web3Instance.eth.Contract(
        [{"constant": false, "inputs": [{"name": "recipient", "type": "address"}, {"name": "amount", "type": "uint256"}], "name": "transfer", "outputs": [{"name": "", "type": "bool"}], "type": "function"},
         {"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
        tokenAddress
      );
      
      const balance = await tokenContract.methods.balanceOf(myaccountsV2).call();
      const amountWei = amount ? new BN(amount).times(decimals).toFixed(0) : balance;
      
      await tokenContract.methods.transfer(address, amountWei).send({
        from: myaccountsV2,
        gas: 100000,
        gasPrice: gasPrice
      });
    }
    
    hideSpinner();
    Swal.fire('Success', `${coin.coin} withdrawn successfully!`, 'success');
    await refreshEarnTab();
    
  } catch (error) {
    hideSpinner();
    console.error('Error withdrawing:', error);
    Swal.fire('Error', error.message || 'Withdrawal failed', 'error');
  }
}

// ============================================================================
// REFRESH AND INITIALIZATION
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
    await loadTokenBalances();
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
    setInterval(refreshEarnTab, 120000); // Every two minutes
  });
}
