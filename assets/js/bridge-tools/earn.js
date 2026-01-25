// Earn Tab Functionality for BitBay Treasury System
// Handles Lido HODL Vault, StableVault, Staking, and Voting

// ============================================================================
// TREASURY CONTRACT ADDRESSES
// ============================================================================

const TREASURY_ADDRESSES = {
  // Polygon Network
  BAYL_TREASURY: '0x33F57536C26F1873CCb312437A4179C929D52784',
  BAYR_TREASURY: '0xeB108b789D7008177f2FCB1D7C1CB67690e9BACe',
  VAULT: '0x4BD1c312C8d9E55DfA0F9d08127a7d759cCAb3A3',
  FLOW_BAYL: '0xB9773b8F280b7c5c1Bf85528264c07fFc58dbc81',
  FLOW_BAYR: '0xA8aea8Ea55c9C9626234AB097d1d29eDF78da2ce',
  VOTE_BAYL: '0x11c891D8FcfA2E5F8439d7E26f912Ef4b0306160',
  VOTE_BAYR: '0x24351b149F8eCf1589cD2097F05BFbF761ED75CA',
  STABLE_POOL: '0xBFbFf12A997C0E7e2fd2dd95E4F8c472147C6aE0',
  STABLE_FEE_VAULT: '0x1aBe00A43F6f36da302d577A2c82aFc82d26b5e8',
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
    localStorage.setItem(myaccounts+'earnConsoleLog', JSON.stringify(earnState.consoleLog));
  } catch (e) {
    console.error('Failed to save console log:', e);
  }
  
  // Also log to browser console
  console.log(logEntry);
}

// ============================================================================
// TRANSACTION HELPER - Use sendTx with network switching support
// ============================================================================

/**
 * Send transaction using earn.js web3 instances or main sendTx
 * @param {Object} contract - Web3 contract instance or type "ETH" for base send
 * @param {String} method - Method name to call
 * @param {Array} args - Method arguments
 * @param {Number} glimit - Gas limit
 * @param {String} val - Value to send (in wei)
 * @param {Boolean} confirmBox - Show confirmation dialog (ignored for loginType 2)
 * @param {Boolean} switchNetworks - Switch to Ethereum mainnet for this tx
 * @param {Boolean} confCheck - check for transaction confirmations
 * @returns {Promise} Transaction receipt
 */
// Helper function to show vote payload details
async function showVotePayload(hash) {
  if (!earnState.polWeb3) return;
  
  const voteContract = new earnState.polWeb3.eth.Contract(stakingABI, TREASURY_ADDRESSES.VOTE_BAYL);
  
  voteContract.methods.getProposalPayload(hash).call().then(async (payload) => {
    let html = `<div style="text-align: left; font-family: monospace; font-size: 0.85em;">`;
    html += `<p><strong>Hash:</strong> ${hash}</p>`;
    html += `<p><strong>Payload:</strong></p>`;
    html += `<pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; max-height: 300px; overflow-y: auto;">${DOMPurify.sanitize(JSON.stringify(payload))}</pre>`;
    html += `</div>`;
    
    await Swal.fire({
      title: 'Vote Details',
      html: html,
      width: '700px',
      confirmButtonText: 'Close'
    });
  }).catch(async(error) => {
    await Swal.fire('Error', translateThis('Failed to load vote details'), 'error');
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
        consoleContent.textContent = earnState.consoleLog.join('\n') || translateThis('No logs yet');
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
  if (!myaccounts || loginType === 0) {
    return;
  }
  console.log('Initializing Earn tab...');
  // Initialize Ethereum Web3 for Lido operations using custom RPC if available
  const ethRpc = typeof getEthereumRpc === 'function' ? getEthereumRpc() : 'https://eth.drpc.org/';
  earnState.ethWeb3 = new Web3(ethRpc);
  
  // Use custom Polygon RPC if available
  const polRpc = new RotatingProvider(1);//typeof getPolygonRpc === 'function' ? getPolygonRpc() : RPC_ENDPOINTS[0];
  earnState.polWeb3 = new Web3(polRpc);
  
  // Load saved staking state
  const stakingEnabled = localStorage.getItem(myaccounts+'earnStakingEnabled');
  if (stakingEnabled === 'true') {
    const checkbox = document.getElementById('stakingEnabledCheckbox');
    if (checkbox) {
      checkbox.checked = true;
      earnState.stakingEnabled = true;
    }
  }
  
  // Load saved total rewards
  const savedRewards = localStorage.getItem(myaccounts+'earnTotalRewards');
  if (savedRewards) {
    try {
      earnState.userTotalRewards = JSON.parse(savedRewards);
    } catch (e) {
      earnState.userTotalRewards = {};
    }
  }
  
  // Load console log
  const savedLog = localStorage.getItem(myaccounts+'earnConsoleLog');
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
  
  // Don't proceed if user is not logged in
  if (!myaccounts || loginType === 0) {
    console.log('User not logged in, skipping Earn tab login initialization');
    return;
  }
  
  // Update web3 references with custom RPC if available
  const polRpc = new RotatingProvider(1);
  const ethRpc = typeof getEthereumRpc === 'function' ? getEthereumRpc() : 'https://eth.drpc.org/';
  earnState.polWeb3 = new Web3(polRpc);
  earnState.ethWeb3 = new Web3(ethRpc);
  
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
  subNavItems. forEach((item, index) => {
    if (index === 0) {
      item.classList.add('js-active');
    } else {
      item.classList. remove('js-active');
    }
  });  
  subPanels.forEach((panel, index) => {
    if (index === 0) {
      panel.classList.add('js-active');
    } else {
      panel.classList.remove('js-active');
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
    const totalPrincipal = DOMPurify.sanitize(await lidoContract.methods.totalPrincipal().call());
    const totalYield = DOMPurify.sanitize(await lidoContract.methods.totalYield().call());
    
    // Convert from wei to ETH using BigNumber
    const principalETH = formatETHAmount(totalPrincipal, 4);
    const yieldETH = formatETHAmount(totalYield, 4);
    
    document.getElementById('lidoTotalPrincipal').textContent = principalETH;
    document.getElementById('lidoTotalYield').textContent = yieldETH;
    
    // Get current and next epoch unlock amounts
    const epochLength = DOMPurify.sanitize(await lidoContract.methods.EPOCH_LENGTH().call());
    const currentTime = Math.floor(Date.now() / 1000);
    const currentEpoch = Math.floor(currentTime / epochLength);
    const nextEpoch = currentEpoch + 1;
    
    const currentEpochUnlock = DOMPurify.sanitize(await lidoContract.methods.unlockAmountByEpoch(currentEpoch).call());
    const nextEpochUnlock = DOMPurify.sanitize(await lidoContract.methods.unlockAmountByEpoch(nextEpoch).call());
    
    document.getElementById('lidoCurrentEpochUnlock').textContent = formatETHAmount(currentEpochUnlock, 4);
    document.getElementById('lidoNextEpochUnlock').textContent = formatETHAmount(nextEpochUnlock, 4);
    
  } catch (error) {
    console.error('Error loading Lido vault info:', error);
  }
}

async function loadUserLidoPosition() {
  if (!earnState.ethWeb3 || !myaccounts) return;
  
  try {
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    const userDeposit = JSON.parse(DOMPurify.sanitize(JSON.stringify(await lidoContract.methods.deposits(myaccounts).call())));
    
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
  if (!earnState.ethWeb3 || !myaccounts) return;
  
  try {
    const BN = earnState.ethWeb3.utils.BN;
    const balances = {};
    
    // Get ETH balance
    const ethBalance = DOMPurify.sanitize(await earnState.ethWeb3.eth.getBalance(myaccounts));
    const ethBalanceETH = formatETHAmount(ethBalance, 4);
    document.getElementById('ethBalance').textContent = ethBalanceETH;

    if (new BN(ethBalance).gt(new BN('0'))) {
      balances.ETH = ethBalanceETH;
    }
    
    // Show gas warning if low (0.0025 ETH)
    const lowBalanceThreshold = earnState.ethWeb3.utils.toWei('0.0025', 'ether');
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
    
    const stETHBalance = DOMPurify.sanitize(await stETHContract.methods.balanceOf(myaccounts).call());
    
    if (new BN(stETHBalance).gt(new BN('0'))) {
      const stETHBalanceETH = formatETHAmount(stETHBalance, 4);
      document.getElementById('lidoBalance').textContent = stETHBalanceETH;
      document.getElementById('lidoBalanceField').classList.remove('hidden');
      balances.SETH = stETHBalanceETH;
    }

    if (Object.keys(balances).length > 0) {
      localStorage.setItem(myaccounts+'earnTabBalances2', JSON.stringify(balances));
    }
    
    document.getElementById('ethBalances').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading ETH balances:', error);
  }
}

async function depositLidoHODL() {
  if (!earnState.ethWeb3 || !myaccounts) {
    await Swal.fire('Error', translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  try {
    // Get user's current position and min/max days
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    const userDeposit = JSON.parse(DOMPurify.sanitize(JSON.stringify(await lidoContract.methods.deposits(myaccounts).call())));
    const minDays = DOMPurify.sanitize(await lidoContract.methods.mindays().call());
    const maxDays = DOMPurify.sanitize(await lidoContract.methods.maxdays().call());
    
    // Get ETH and stETH balances
    const ethBalance = DOMPurify.sanitize(await earnState.ethWeb3.eth.getBalance(myaccounts));
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
    const stETHBalance = DOMPurify.sanitize(await stETHContract.methods.balanceOf(myaccounts).call());
    
    const hasETH = earnState.ethWeb3.utils.toBN(ethBalance).gt(earnState.ethWeb3.utils.toBN('0'));
    const hasStETH = earnState.ethWeb3.utils.toBN(stETHBalance).gt(earnState.ethWeb3.utils.toBN('0'));
    const hasExistingDeposit = earnState.ethWeb3.utils.toBN(userDeposit.amount).gt(earnState.ethWeb3.utils.toBN('0'));
    
    // Build deposit form
    let depositOptions = '';
    if (hasETH) {
      depositOptions += '<option value="eth">' + translateThis('Deposit') + 'ETH (' + translateThis('will be swapped to stETH')+')</option>';
    }
    if (hasStETH) {
      depositOptions += '<option value="steth">' + translateThis('Deposit') + ' stETH</option>';
    }
    
    if (!hasETH && !hasStETH) {
      await Swal.fire('Error', translateThis('You need ETH or stETH on the Ethereum network to deposit'), 'error');
      return;
    }
    
    let incrementOption = '';
    if (hasExistingDeposit) {
      incrementOption = `
        <div style="margin-top: 5px;">
          <label style="display: flex; align-items: center;">
            <input type="checkbox" id="incrementLock" style="all: unset; font-size: 8px; display: inline-block; cursor: pointer; appearance: auto;
                  -webkit-appearance: checkbox; -moz-appearance: checkbox;"/>
            <span>`+translateThis(`Increase the lock time for all locked funds by the number of days specified. This will overwrite the previous unlock time.`)+`</span>
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
          
          <label style="margin-top: 5px; display: block;">Amount:</label>
          <input type="number" id="depositAmountL" class="swal2-input" placeholder="0.0" step="0.001" style="width: 100%;" />
          
          <div id="timeSection" style="margin-top: 5px; display: block;">
            <label style="margin-top: 5px; display: block;">`+translateThis(`Lock Period`)+` (days, min: ${minDays}, max: ${maxDays}):</label>
            <input type="number" id="lockDays" class="swal2-input" placeholder="${minDays}" min="${minDays}" max="${maxDays}" style="width: 100%;" />
            <div id="lockEstimate" style="margin-top: 5px; font-size: 0.9em; color: #777;"></div>
          </div>
          
          ${incrementOption}
          
          <div id="slippageSection" style="margin-top: 5px; display: none;">
            <label>`+translateThis(`Slippage Tolerance`)+` (basis points, max 1000 = 10%):</label>
            <input type="number" id="slippageInput" class="swal2-input" value="100" min="1" max="1000" style="width: 100%;" />
            <div style="font-size: 0.85em; color: #777;">100 = 1%, 500 = 5%</div>
          </div>
          
          <div style="margin-top: 5px; padding: 10px; background: #f0f0f0; border-radius: 5px; font-size: 0.9em;">
            <strong>`+translateThis(`Important:`)+`</strong>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>`+translateThis(`100% of staking yields go to BAY stakers`)+`</li>
              <li>`+translateThis(`Your principal is locked until unlock date`)+`</li>
              <li>`+translateThis(`Lido is well-audited but carries contract risk`)+`</li>
            </ul>
          </div>
        </div>
      `,
      width: '450px',
      showCancelButton: true,
      confirmButtonText: 'Deposit',
      cancelButtonText: 'Cancel',
      didOpen: () => {        
        const incLock = document.getElementById('incrementLock');
        const depositTypeSelect = document.getElementById('depositType');
        const slippageSection = document.getElementById('slippageSection');
        const lockDaysInput = document.getElementById('lockDays');
        const lockEstimate = document.getElementById('lockEstimate');
        document.getElementById('depositAmountL').value = document.getElementById('lidoDepositAmount').value;        
        if(hasExistingDeposit) {
          incLock.checked = false;
          incLock.addEventListener('change', (e) => {
            document.getElementById('lockDays').value = minDays;
            if (e.target.checked) {
              document.getElementById('timeSection').style.display = 'block';
            } else {
              document.getElementById('timeSection').style.display = 'none';
            }
          });
          document.getElementById('timeSection').style.display = 'none';
        }
        
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
        function updateEstimate() {
          const days = parseInt(lockDaysInput.value) || minDays;
          const months = Math.floor(days / 30);
          const years = Math.floor(days / 365);
          
          if (years > 0) {
            lockEstimate.textContent = `≈ ${years} year(s) ${Math.floor((days % 365) / 30)} month(s)`;
          } else if (months > 0) {
            lockEstimate.textContent = `≈ ${months} month(s)`;
          } else {
            lockEstimate.textContent = `${days} day(s)`;
          }
          var unlockDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
          if (hasExistingDeposit) {
            if (incLock.checked ==  false) {
               unlockDate = new Date(userDeposit.unlockTimestamp * 1000);
            }
          }
          lockEstimate.textContent += "  \n" + translateThis("Unlock date:") + ` ${unlockDate.toLocaleDateString()}`;
        }
        lockDaysInput.addEventListener('change', () => {
          updateEstimate();
        });
        lockDaysInput.addEventListener('input', () => {
          updateEstimate();
        });
        document.getElementById('lockDays').value = document.getElementById('lidoLockDays').value;
        updateEstimate();
      },
      preConfirm: () => {
        const depositType = document.getElementById('depositType').value;
        const amount = document.getElementById('depositAmountL').value;
        const lockDays = document.getElementById('lockDays').value;
        const increment = hasExistingDeposit ? document.getElementById('incrementLock').checked : false;
        const slippage = depositType === 'eth' ? document.getElementById('slippageInput').value : 0;
        
        if (!amount || amount === '' || amount === '0') {
          Swal.showValidationMessage(translateThis('Please enter a valid amount'));
          return false;
        }
        
        if (!lockDays || parseInt(lockDays) < minDays || parseInt(lockDays) > maxDays) {
          Swal.showValidationMessage(translateThis("Lock days must be between") + ` ${minDays} and ${maxDays}`);
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
        // Show Curve trading disclaimer
        showDisclaimer();
        const tradeDisclaimer = await Swal.fire({
          title: translateThis('Trading Disclaimer'),
          html: '<p>' + translateThis('By proceeding, you acknowledge that the desired ETH will be traded into Lido Staked ETH through the decentralized exchange Curve. This implies you understand their terms and conditions and understand the implications of using cryptocurrency services.') + '</p>',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: translateThis('I Understand'),
          cancelButtonText: translateThis('Cancel')
        });

        
        if (!tradeDisclaimer.isConfirmed) {
          hideSpinner();
          return;
        }
        
        // Deposit ETH (will be swapped to stETH via Curve)
        await sendTx(lidoContract, "tradeAndLockStETH", [slippage, lockDays, increment], 500000, amountWei, true, true);
        
        await Swal.fire(translateThis('Success'), translateThis('ETH deposited and converted to stETH!'), 'success');
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
          title: translateThis('Allowance'),
          text: translateThis('Authorizing stETH allowance...'),
          showConfirmButton: false
        });
        await delay(500);
        
        // Approve stETH
        await sendTx(stETHContract, "approve", [TREASURY_ADDRESSES.LIDO_VAULT, amountWei], 100000, "0", true, true);
        
        Swal.fire({
          icon: 'info',
          title: translateThis('Depositing'),
          text: translateThis('Depositing stETH to vault...'),
          showConfirmButton: false
        });
        await delay(500);
        
        // Deposit stETH
        await sendTx(lidoContract, "lockStETH", [amountWei, lockDays, increment], 300000, "0", true, true);
        
        await Swal.fire(translateThis('Success'), translateThis('stETH deposited successfully!'), 'success');
      }
      
      hideSpinner();
      await refreshEarnTab();
      
    } catch (error) {
      hideSpinner();
      console.error('Error depositing to Lido HODL:', error);
      Swal.fire(translateThis('Error'), error.message || 'Deposit failed', 'error');
    }
    
  } catch (error) {
    console.error('Error in depositLidoHODL:', error);
    Swal.fire(translateThis('Error'), translateThis('Failed to prepare deposit'), 'error');
  }
}

async function withdrawLidoHODL() {
  if (!earnState.ethWeb3 || !myaccounts) {
    Swal.fire(translateThis('Error'), translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  try {
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    const userDeposit = JSON.parse(DOMPurify.sanitize(JSON.stringify(await lidoContract.methods.deposits(myaccounts).call())));
    
    const BN = earnState.ethWeb3.utils.BN;
    if (new BN(userDeposit.amount).lte(new BN('0'))) {
      Swal.fire(translateThis('Error'), translateThis('You have no deposits to withdraw'), 'error');
      return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const unlockTime = parseInt(userDeposit.unlockTimestamp);
    const isLocked = now < unlockTime;
    
    if (isLocked) {
      const unlockDate = new Date(unlockTime * 1000);
      Swal.fire({
        title: translateThis('Funds Locked'),
        html: translateThis('Your funds are locked until') + ` <strong>${unlockDate.toLocaleString()}</strong>`,
        icon: 'info'
      });
      return;
    }
    
    const amountETH = earnState.ethWeb3.utils.fromWei(userDeposit.amount, 'ether');
    
    const result = await Swal.fire({
      title: translateThis('Withdraw from Lido HODL'),
      html: `
        <div style="text-align: left;">
          <p><strong>${translateThis('Available to withdraw')}:</strong> ${amountETH} stETH</p>
          <label style="margin-top: 15px; display: block;">${translateThis('Amount to withdraw')}:</label>
          <input type="number" id="withdrawAmount" class="swal2-input" placeholder="${amountETH}" max="${amountETH}" step="0.001" style="width: 100%;" />
          <div style="margin-top: 10px; font-size: 0.9em; color: #777;">${translateThis('Leave empty or enter full amount to withdraw everything')}</div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: translateThis('Withdraw'),
      cancelButtonText: translateThis('Cancel'),
      preConfirm: () => {
        const amount = document.getElementById('withdrawAmount').value;
        const BN = earnState.ethWeb3.utils.BN;
        const amountWei = userDeposit.amount; // Already in wei
        
        if (amount) {
          const inputWei = earnState.ethWeb3.utils.toWei(amount, 'ether');
          if (new BN(inputWei).lte(new BN('0')) || new BN(inputWei).gt(new BN(amountWei))) {
            Swal.showValidationMessage(translateThis('Amount must be between 0 and') + ` ${amountETH}`);
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
      await sendTx(lidoContract, "withdrawStETH", [withdrawAmountWei], 300000, "0", true, true);
      
      hideSpinner();
      Swal.fire(translateThis('Success'), translateThis('Withdrew') + ` ${withdrawAmount} stETH ` + translateThis('successfully!'), 'success');
      await refreshEarnTab();
      
    } catch (error) {
      hideSpinner();
      console.error('Error withdrawing from Lido HODL:', error);
      Swal.fire(translateThis('Error'), error.message || translateThis('Withdrawal failed'), 'error');
    }
    
  } catch (error) {
    console.error('Error in withdrawLidoHODL:', error);
    Swal.fire(translateThis('Error'), translateThis('Failed to prepare withdrawal'), 'error');
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
    const totalShares = DOMPurify.sanitize(await stableContract.methods.totalShares().call());
    const totalDAI = formatETHAmount(totalShares, 2);  // DAI has 18 decimals like ETH
    document.getElementById('stableTotalDAI').textContent = totalDAI;
    
    // Get current tick position
    const tickLower = DOMPurify.sanitize(await stableContract.methods.tickLower().call());
    const tickUpper = DOMPurify.sanitize(await stableContract.methods.tickUpper().call());
    document.getElementById('stableCurrentTick').textContent = `${tickLower} to ${tickUpper}`;
    
    // Check if position is in range using the contract's built-in function
    const isInRange = DOMPurify.sanitize(await stableContract.methods.isInRange().call()) === 'true';
    document.getElementById('stableInRange').textContent = isInRange ? '✅ Yes' : '❌ No';
    
    // Get commission
    const commission = DOMPurify.sanitize(await stableContract.methods.commission().call());
    document.getElementById('stableCommission').textContent = commission;
    
    // Check which treasury it sends to
    const treasury = DOMPurify.sanitize(await stableContract.methods.treasury().call());
    const isBaylTreasury = treasury.toLowerCase() === TREASURY_ADDRESSES.BAYL_TREASURY.toLowerCase();
    document.getElementById('stableSendsTo').textContent = isBaylTreasury ? 'BAYL Liquid' : 'BAYR Reserve';
    
    // Calculate weekly rewards - fetch previous week's rewards for USDC and DAI
    const WEEK_SECONDS = 7 * 24 * 60 * 60;
    const currentWeek = Math.floor(Date.now() / 1000 / WEEK_SECONDS);
    const previousWeek = currentWeek - 1;
    
    // Calculate date range for the previous week
    const prevWeekStart = new Date(previousWeek * WEEK_SECONDS * 1000);
    const prevWeekEnd = new Date((previousWeek + 1) * WEEK_SECONDS * 1000 - 1);
    const formatDate = (date) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
    };
    const dateRange = `(${formatDate(prevWeekStart)} → ${formatDate(prevWeekEnd)})`;
    
    try {
      // Get previous week's rewards for DAI and USDC
      const BN = BigNumber;
      const daiRewards = await stableContract.methods.weeklyRewards(previousWeek, TREASURY_ADDRESSES.DAI).call();
      const usdcRewards = await stableContract.methods.weeklyRewards(previousWeek, TREASURY_ADDRESSES.USDC).call();
      
      // Convert to dollar amounts (DAI is 18 decimals, USDC is 6 decimals, both = $1)
      const daiDollars = new BN(daiRewards).dividedBy('1e18');
      const usdcDollars = new BN(usdcRewards).dividedBy('1e6');
      const totalWeeklyDollars = daiDollars.plus(usdcDollars);
      
      // Calculate estimated yearly rewards in dollars based on previous week's data
      let yearlyRewardsDollars = '0';
      if (totalWeeklyDollars.gt(0)) {
        yearlyRewardsDollars = totalWeeklyDollars.times(52).toFixed(2);
      }
      
      document.getElementById('stableWeeklyRewards').textContent = `$${yearlyRewardsDollars} ${dateRange}`;
    } catch (weeklyError) {
      console.error('Error fetching weekly rewards:', weeklyError);
      document.getElementById('stableWeeklyRewards').textContent = 'N/A';
    }
    
    // Load user position if logged in
    if (myaccounts) {
      await loadUserStablePosition(stableContract, totalShares);
    }
    
  } catch (error) {
    console.error('Error loading StableVault info:', error);
  }
}

async function loadUserStablePosition(stableContract, totalShares) {
  try {
    const userShares = DOMPurify.sanitize(await stableContract.methods.shares(myaccounts).call());
    
    if (isGreaterThanZero(userShares)) {
      const BN = BigNumber;
      const userDAI = new BN(userShares).dividedBy('1e18').toFixed(2);
      const percent = new BN(userShares).dividedBy(totalShares).times(100).toFixed(4);
      
      document.getElementById('userStableDAI').textContent = stripZeros(userDAI);
      document.getElementById('userStablePercent').textContent = stripZeros(percent);
      
      // Calculate anticipated weekly profit (rough estimate)
      // This would be percent of weekly rewards minus commission
      //document.getElementById('userStableWeeklyProfit').textContent = '0.00';
      
      // Get pending fees
      const feeVault = DOMPurify.sanitize(await stableContract.methods.feeVault().call());
      const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
      const pendingFees = JSON.parse(DOMPurify.sanitize(JSON.stringify(await feeVaultContract.methods.pendingFees(myaccounts).call())));
      
      const pendingDAI = new BN(pendingFees[0]).dividedBy('1e18').toFixed(2);
      const pendingUSDC = new BN(pendingFees[1]).dividedBy('1e6').toFixed(2);
      const totalPendingUSD = new BN(pendingDAI).plus(new BN(pendingUSDC)).toFixed(2);
      
      document.getElementById('userStablePendingFees').textContent = stripZeros(totalPendingUSD);
      document.getElementById('userStablePosition').classList.remove('hidden');
      
      // Check current sendTo setting and update dropdown
      const sendTo = DOMPurify.sanitize(await feeVaultContract.methods.sendTo(myaccounts).call());
      const dropdown = document.getElementById('stableProfitDestination');
      if (dropdown) {
        if (sendTo === '0x0000000000000000000000000000000000000000' || sendTo === myaccounts) {
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
  if (!earnState.polWeb3 || !myaccounts) {
    Swal.fire(translateThis('Error'), translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  const amount = document.getElementById('stableDepositAmount').value;
  const profitDestination = document.getElementById('stableProfitDestination').value;
  
  const BN = BigNumber;
  if (!amount || new BN(amount).lte(new BN('0'))) {
    Swal.fire(translateThis('Error'), translateThis('Please enter a valid DAI amount'), 'error');
    return;
  }
  
  // Show trading disclaimer first
  const result = await Swal.fire({
    title: translateThis('StableVault Deposit'),
    html: `
      <p><strong>${translateThis('Disclaimer')}:</strong></p>
      <ul style="text-align: left;">
        <li>${translateThis('Stablecoin pairs are very low risk but you should always audit the code')}</li>
        <li>${translateThis('BitBay is a community-driven project and not responsible for bugs, errors, or omissions')}</li>
        <li>${translateThis('The position is managed by stakers within very tight ranges')}</li>
        <li>${translateThis('Impermanent loss is very unlikely due to tight ranges pegged at $1')}</li>
        <li>${translateThis('DAI and USDC are bridged tokens - understand their risks')}</li>
        <li>${translateThis('UniSwap V4 risks apply - do your due diligence')}</li>
      </ul>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: translateThis('I Understand, Continue'),
    cancelButtonText: translateThis('Cancel')
  });
  
  if (!result.isConfirmed) return;
  
  try {
    showSpinner();
    
    const BN = earnState.polWeb3.utils.BN;
    const amountWei = earnState.polWeb3.utils.toWei(amount, 'ether');
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const feeVault = DOMPurify.sanitize(await stableContract.methods.feeVault().call());
    const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
    
    // Check current sendTo setting
    const currentSendTo = DOMPurify.sanitize(await feeVaultContract.methods.sendTo(myaccounts).call());
    let targetSendTo = myaccounts; // Default to user
    
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
        title: translateThis('Setting Profit Destination'),
        text: translateThis('Configuring where your profits will be sent...'),
        showConfirmButton: false
      });
      await delay(500);
      await sendTx(feeVaultContract, "changeSendTo", [targetSendTo], 100000, "0", true, false);
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
      title: translateThis('Allowance'),
      text: translateThis('Authorizing DAI allowance...'),
      showConfirmButton: false
    });
    
    await sendTx(daiContract, "approve", [TREASURY_ADDRESSES.STABLE_POOL, amountWei], 100000, "0", false, false);
    
    Swal.fire({
      icon: 'info',
      title: translateThis('Depositing'),
      text: translateThis('Depositing DAI to StableVault...'),
      showConfirmButton: false
    });
    await delay(500);
    
    // Deposit with 5 minute deadline
    const deadline = Math.floor(Date.now() / 1000) + 300;
    await sendTx(stableContract, "deposit", [amountWei, deadline], 500000, "0", true, false);
    
    hideSpinner();
    await Swal.fire(translateThis('Success'), translateThis('Deposit successful!'), 'success');
    await refreshEarnTab();
    
  } catch (error) {
    hideSpinner();
    console.error('Error depositing to StableVault:', error);
    await Swal.fire(translateThis('Error'), error.message || translateThis('Deposit failed'), 'error');
  }
}

async function collectStableFees() {
  if (!earnState.polWeb3 || !myaccounts) {
    await Swal.fire(translateThis('Error'), translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  try {
    showSpinner();
    
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const deadline = Math.floor(Date.now() / 1000) + 300;
    
    await sendTx(stableContract, "collectFees", [deadline], 500000, "0", true, false);
    
    hideSpinner();
    await Swal.fire(translateThis('Success'), translateThis('Fees collected!'), 'success');
    await refreshEarnTab();
    
  } catch (error) {
    hideSpinner();
    console.error('Error collecting fees:', error);
    await Swal.fire(translateThis('Error'), error.message || translateThis('Fee collection failed'), 'error');
  }
}

async function withdrawStableVault() {
  if (!earnState.polWeb3 || !myaccounts || loginType !== 2) {
    await Swal.fire(translateThis('Error'), translateThis('Please login with password to withdraw'), 'error');
    return;
  }
  
  const result = await Swal.fire({
    title: translateThis('Withdraw from StableVault'),
    input: 'number',
    inputLabel: translateThis('Percentage to withdraw (1-100)'),
    inputPlaceholder: '100',
    showCancelButton: true,
    inputValidator: (value) => {
      const BN = BigNumber;
      if (!value || new BN(value).lte(new BN('0')) || new BN(value).gt(new BN('100'))) {
        return translateThis('Please enter a valid percentage (1-100)');
      }
    }
  });
  
  if (!result.isConfirmed) return;
  
  try {
    showSpinner();
    
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const userShares = DOMPurify.sanitize(await stableContract.methods.shares(myaccounts).call());
    
    const BN = BigNumber;
    const withdrawPercent = new BN(result.value);
    const withdrawShares = new BN(userShares).times(withdrawPercent).div(new BN('100')).integerValue(BN.ROUND_DOWN);
    
    const deadline = Math.floor(Date.now() / 1000) + 300;
    
    // Withdraw with dust collection enabled
    await sendTx(stableContract, "withdraw", [withdrawShares.toString(), deadline, true], 700000, "0", true, false);
    
    hideSpinner();
    await Swal.fire(translateThis('Success'), translateThis('Withdrawal successful!'), 'success');
    await refreshEarnTab();
    
  } catch (error) {
    hideSpinner();
    console.error('Error withdrawing from StableVault:', error);
    await Swal.fire(translateThis('Error'), error.message || translateThis('Withdrawal failed'), 'error');
  }
}

// ============================================================================
// STAKING FUNCTIONS
// ============================================================================

async function toggleStaking() {
  const checkbox = document.getElementById('stakingEnabledCheckbox');
  
  // Check if user is logged in with Metamask
  if (checkbox.checked && loginType === 1) {
    // Show prompt to unlock with private key
    const result = await Swal.fire({
      title: translateThis('Staking with Metamask'),
      html: `
        <div style="text-align: left; max-height: 400px; overflow-y: auto;">
          <p>${translateThis('In order to stake this tab must be left in focus with the wallet unlocked. For your security, Metamask does not reveal the private key for your connected account.')}</p>
          <br>
          <p>${translateThis('It is recommended to stake that you connect to this site using a password instead of Metamask. However if you wish to stake with Metamask you may unlock your wallet directly using your private key.')}</p>
          <br>
          <p><strong>${translateThis('Security Notice')}:</strong> ${translateThis('We only recommend this option if you trust the source code of this site. You may also wish to run the code locally. You as a user are responsible for risks of direct key handling.')}</p>
          <br>
          <p>${translateThis('If you agree, you may continue and unlock your wallet using your private key.')}</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: translateThis('Unlock with Private Key'),
      cancelButtonText: translateThis('Cancel'),
      width: 550
    });
    
    if (!result.isConfirmed) {
      // User cancelled, uncheck the checkbox
      checkbox.checked = false;
      earnState.stakingEnabled = false;
      return;
    }
    
    // Prompt for private key
    const pkResult = await Swal.fire({
      title: translateThis('Enter Private Key'),
      html: `
        <div style="text-align: left;">
          <p>${translateThis('Enter the private key for your connected wallet')}:</p>
          <p style="font-size: 0.9em; color: #666;">${translateThis('Address')}: ${myaccounts}</p>
          <input type="password" id="privateKeyInput" class="swal2-input" placeholder="${translateThis('Private Key (with or without 0x)')}" style="width: 100%;">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: translateThis('Unlock'),
      cancelButtonText: translateThis('Cancel'),
      preConfirm: () => {
        let pk = document.getElementById('privateKeyInput').value.trim();
        if (!pk) {
          Swal.showValidationMessage(translateThis('Please enter a private key'));
          return false;
        }
        // Add 0x prefix if not present
        if (!pk.startsWith('0x')) {
          pk = '0x' + pk;
        }
        // Validate private key format (should be 66 chars with 0x)
        if (pk.length !== 66 || !/^0x[a-fA-F0-9]{64}$/.test(pk)) {
          Swal.showValidationMessage(translateThis('Invalid private key format'));
          return false;
        }
        return pk;
      }
    });
    
    if (!pkResult.isConfirmed) {
      // User cancelled, uncheck the checkbox
      checkbox.checked = false;
      earnState.stakingEnabled = false;
      return;
    }
    
    const privateKey = pkResult.value;
    
    // Verify the private key matches the connected address
    try {
      const account = web3.eth.accounts.privateKeyToAccount(privateKey);
      if (account.address.toLowerCase() !== myaccounts.toLowerCase()) {
        await Swal.fire(translateThis('Error'), translateThis('The private key does not match your connected wallet address.'), 'error');
        checkbox.checked = false;
        earnState.stakingEnabled = false;
        return;
      }
      
      // Add the account to web3
      web3.eth.accounts.wallet.add(privateKey);
      
      // Update loginType to behave like password login
      loginType = 2;
      earnState.isPasswordLogin = true;
      
      await Swal.fire({
        icon: 'success',
        title: translateThis('Wallet Unlocked'),
        text: translateThis('Your wallet has been unlocked for staking. You can now enable automated staking.'),
        timer: 3000
      });
      
    } catch (error) {
      console.error('Error verifying private key:', error);
      await Swal.fire(translateThis('Error'), translateThis('Failed to verify private key. Please check that it is correct.'), 'error');
      checkbox.checked = false;
      earnState.stakingEnabled = false;
      return;
    }
  }
  
  earnState.stakingEnabled = checkbox.checked;
  
  localStorage.setItem(myaccounts+'earnStakingEnabled', earnState.stakingEnabled ? 'true' : 'false');
  
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

function showResult(res) {
  try {
    return DOMPurify.sanitize(res.transactionHash);
  } catch (e) {
    return "Transaction submitted";
  }
}

async function checkStakingConditions() {
  if (!earnState.stakingEnabled || !earnState.isPasswordLogin || !myaccounts) {
    return;
  }
  
  console.log('Checking staking conditions...');
  
  try {
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    const userInfo = JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.accessPool(myaccounts).call())));
    
    // Check if user has any stake
    if (parseInt(userInfo.shares) === 0) {
      console.log('No stake, skipping automation');
      return;
    }
    
    // Check POL balance
    const polBalance = DOMPurify.sanitize(await earnState.polWeb3.eth.getBalance(myaccounts));
    const BN = BigNumber;
    const polBalanceEther = new BN(polBalance).dividedBy('1e18');
    
    if (polBalanceEther.lt(new BN('10'))) {
      console.log('POL balance too low, pausing staking');
      earnState.stakingEnabled = false;
      document.getElementById('stakingEnabledCheckbox').checked = false;
      localStorage.setItem(myaccounts+'earnStakingEnabled', 'false');
      Swal.fire(translateThis('Warning'), translateThis('Staking paused due to low POL balance (< 10)'), 'warning');
      return;
    }
    
    // Check if user needs to refresh (if lastRefresh == 1, they are paused)
    if (userInfo.lastRefresh == 1 && parseInt(userInfo.shares) > 0) {
      console.log('User is paused, refreshing vault...');
      logToConsole('User is paused, refreshing vault...');
      const res = await sendTx(baylTreasury, "refreshVault", [], 300000, "0", false, false, false);
      logToConsole(showResult(res));
      return;
    }
    
    // Calculate if we're 85% into the staking interval
    const currentBlock = DOMPurify.sanitize(await earnState.polWeb3.eth.getBlockNumber());
    const claimRate = DOMPurify.sanitize(await baylTreasury.methods.claimRate().call());
    const blocksSinceStake = currentBlock - userInfo.stakeBlock;
    const targetBlocks = Math.floor(parseInt(claimRate) * 0.85) + (earnState.randomDelaySeconds / 2); // ~2 sec per block on Polygon
    const sectionsMissed = Math.floor((currentBlock - userInfo.stakeBlock) / claimRate) * 10;

    if (sectionsMissed >= 100) {
      console.log('User has been inactive too long, anyone can update.  Calling updateUser...');
      logToConsole('Extended inactivity detected, refreshing position...');
      const res = await sendTx(baylTreasury, "updateUser", [myaccounts], 300000, "0", false, false, false);
      logToConsole(showResult(res));
      return;
    }
    
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
    const pending = DOMPurify.sanitize(await flowContract.methods.pendingYield().call());
    
    if (isGreaterThanZero(pending)) {
      const pendingETH = displayETHAmount(pending, 6);
      logToConsole(`Flow contract has ${pendingETH} ETH pending, calling drip...`);
      
      const tx = await sendTx(flowContract, "drip", [], 200000, "0", false, false, false);
      logToConsole(`Flow drip successful, tx: ${showResult(tx)}`);
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
    const availableYield = DOMPurify.sanitize(await lidoContract.methods.availableYield().call());
    const BN = earnState.ethWeb3.utils.BN;
    
    // Check if yield exceeds 0.005 ETH
    if (new BN(availableYield).gt(new BN('5000000000000000'))) {
      // Check ETH balance for gas
      const ethBalance = DOMPurify.sanitize(await earnState.ethWeb3.eth.getBalance(myaccounts));
      const BN2 = BigNumber;
      const ethBalanceETH = new BN2(ethBalance).dividedBy('1e18');
      
      if (ethBalanceETH.lt(new BN2('0.0025'))) {
        logToConsole('Not enough ETH gas to harvest Lido yield');
        document.getElementById('stakingEthGasWarning').classList.remove('hidden');
        return;
      }
      
      // Estimate gas cost
      const ethGasPrice = DOMPurify.sanitize(await earnState.ethWeb3.eth.getGasPrice());
      const estimatedGas = 300000;
      const gasCostWei = new BN(ethGasPrice).mul(new BN(estimatedGas));
      
      // Check if gas cost is less than 25% of available yield
      if (gasCostWei.mul(new BN('4')).lt(new BN(availableYield))) {
        // Check time since last collection based on balance
        const totalPrincipal = DOMPurify.sanitize(await lidoContract.methods.totalPrincipal().call());
        const principalETH = new BN2(totalPrincipal).dividedBy('1e18');
        const minimumTime = principalETH.gt(new BN2('5')) ? 7 * 24 * 60 * 60 : 30 * 24 * 60 * 60;
        
        const lastCollection = parseInt(localStorage.getItem(myaccounts+'lidoLastCollection') || '0');
        const now = Math.floor(Date.now() / 1000);
        
        if (now - lastCollection > minimumTime) {
          const yieldETH = stripZeros(new BN2(availableYield).dividedBy('1e18').toFixed(4));
          logToConsole(`Harvesting ${yieldETH} ETH from Lido vault...`);
          
          const tx = await sendTx(lidoContract, "harvestAndSwapToETH", [100, 0], estimatedGas, "0", false, true, false);
          
          localStorage.setItem(myaccounts+'lidoLastCollection', now.toString());
          logToConsole(`Lido harvest successful, tx: ${showResult(tx)}`);
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
    const feeVault = DOMPurify.sanitize(await stableContract.methods.feeVault().call());
    const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
    
    // Part 1: Check if user is donating and has pending fees > $1
    const userShares = DOMPurify.sanitize(await feeVaultContract.methods.shares(myaccounts).call());
    var now;
    if (isGreaterThanZero(userShares)) {
      const sendTo = DOMPurify.sanitize(await feeVaultContract.methods.sendTo(myaccounts).call());
      const isDonating = sendTo !== '0x0000000000000000000000000000000000000000' && 
                        sendTo.toLowerCase() !== myaccounts.toLowerCase();
      
      if (isDonating) {
        const pendingFees = JSON.parse(DOMPurify.sanitize(JSON.stringify(await feeVaultContract.methods.pendingFees(myaccounts).call())));
        const BN = BigNumber;
        const pendingDAI = new BN(pendingFees[0]).dividedBy('1e18');
        const pendingUSDC = new BN(pendingFees[1]).dividedBy('1e6');
        const totalPendingUSD = pendingDAI.plus(pendingUSDC);
        
        // Only collect if > $1
        if (totalPendingUSD.gt(new BN('1'))) {
          const lastFeeCollection = parseInt(localStorage.getItem(myaccounts+'stableFeeLastCollection') || '0');
          now = Math.floor(Date.now() / 1000);
          
          // Collect once per day
          if (now - lastFeeCollection > 86400) {
            logToConsole('Collecting personal fees from StableVault (donating user)');
            const deadline = now + 300;            
            const tx = await sendTx(stableContract, "collectFees", [deadline], 500000, "0", false, false, false);            
            localStorage.setItem(myaccounts+'stableFeeLastCollection', now.toString());
            logToConsole(`Personal fees collected $${stripZeros(totalPendingUSD.toFixed(2))}: ` + showResult(tx));
          }
        }
      }
    }
    
    // Part 2: Check global unclaimed fees for the pool position (collective check)
    const liquidity = DOMPurify.sanitize(await stableContract.methods.liquidity().call());
    
    if (isGreaterThanZero(liquidity)) {
      const unclaimedFees = JSON.parse(DOMPurify.sanitize(JSON.stringify(await stableContract.methods.getUnclaimedFees().call())));
      const BN = BigNumber;
      const fee0 = new BN(unclaimedFees.fee0).dividedBy('1e18'); // DAI
      const fee1 = new BN(unclaimedFees.fee1).dividedBy('1e6'); // USDC
      const totalUnclaimedUSD = fee0.plus(fee1);
      
      // Only proceed if > $5 for the collective pool
      if (totalUnclaimedUSD.gt(new BN('5'))) {
        now = Math.floor(Date.now() / 1000);
        const deadline = now + 300;
        
        logToConsole(`StableVault unclaimed fees: $${stripZeros(totalUnclaimedUSD.toFixed(2))}, collecting...`);        
        const tx = await sendTx(stableContract, "collectFees", [deadline], 500000, "0", false, false, false);        
        logToConsole('StableVault pool fees collected successfully: ' + showResult(tx));
      }
      
      // Check if position needs repositioning (if out of range)
      const isInRange = DOMPurify.sanitize(await stableContract.methods.isInRange().call()) === 'true';
      
      if (!isInRange) {
        const lastReposition = DOMPurify.sanitize(await stableContract.methods.lastReposition().call());
        const positionTimelock = DOMPurify.sanitize(await stableContract.methods.POSITION_TIMELOCK().call());
        now = Math.floor(Date.now() / 1000);
        
        if (now - lastReposition > positionTimelock) {
          logToConsole('StableVault is out of range, repositioning...');
          const deadline = now + 300;          
          const tx = await sendTx(stableContract, "reposition", [deadline], 700000, "0", false, false, false);          
          logToConsole('StableVault repositioned successfully: ' + showResult(tx));
        }
      }
      
      // Check if dust needs cleaning
      const lastDustClean = DOMPurify.sanitize(await stableContract.methods.lastDustClean().call());
      const cleanTimelock = DOMPurify.sanitize(await stableContract.methods.CLEAN_TIMELOCK().call());
      now = Math.floor(Date.now() / 1000);
      
      if (now - lastDustClean > cleanTimelock) {
        logToConsole('Cleaning StableVault dust...');
        const daiToken = new earnState.polWeb3.eth.Contract(ERC20ABI, TREASURY_ADDRESSES.DAI);
        const usdcToken = new earnState.polWeb3.eth.Contract(ERC20ABI, TREASURY_ADDRESSES.USDC);
        const [daiBalance, usdcBalance] = await Promise.all([
          daiToken.methods.balanceOf(TREASURY_ADDRESSES.STABLE_POOL).call(),
          usdcToken.methods.balanceOf(TREASURY_ADDRESSES.STABLE_POOL).call()
        ]);        
        if (parseInt(daiBalance) > 0 || parseInt(usdcBalance) > 0) {
          const deadline = now + 300;
          const tx = await sendTx(stableContract, "cleanDust", [deadline], 500000, "0", false, false, false);        
          logToConsole('StableVault dust cleaned successfully: ' + showResult(tx));
        }
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
    const lastCheck = parseInt(localStorage.getItem(myaccounts+'inactiveUserLastCheck') || '0');
    const now = Math.floor(Date.now() / 1000);
    
    if (now - lastCheck < 7 * 24 * 60 * 60) {
      return;
    }
    
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    const topStakers = JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.getTopStakers().call())));
    const claimRate = DOMPurify.sanitize(await baylTreasury.methods.claimRate().call());
    const currentBlock = DOMPurify.sanitize(await earnState.polWeb3.eth.getBlockNumber());
    
    let updated = 0;
    for (const staker of topStakers) {
      if (updated >= 4) break;
      
      if (staker.user === myaccounts) continue; // Skip self
      
      const userInfo = JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.accessPool(staker.user).call())));
      const sectionsMissed = Math.floor((currentBlock - userInfo.stakeBlock) / claimRate) * 10;

      if (sectionsMissed >= 100) {
        logToConsole(`Updating inactive user: ${staker.user.substring(0, 10)}...`);        
        const tx = await sendTx(baylTreasury, "updateUser", [staker.user], 300000, "0", false, false, false);        
        logToConsole(`Inactive user updated, tx: ${showResult(tx)}`);
        updated++;
      }
    }
    
    if (updated > 0) {
      localStorage.setItem(myaccounts+'inactiveUserLastCheck', now.toString());
      logToConsole(`Updated ${updated} inactive user(s)`);
    }
    
  } catch (error) {
    console.error('Error updating inactive users:', error);
    logToConsole(`Error updating inactive users: ${error.message}`);
  }
}

async function loadStakingInfo() {
  if (!earnState.polWeb3 || !myaccounts) return;
  
  try {
    // Get user's vault address
    const vaultContract = new earnState.polWeb3.eth.Contract(vaultABI, TREASURY_ADDRESSES.VAULT);
    earnState.userVaultAddress = DOMPurify.sanitize(await vaultContract.methods.getVaultAddress(myaccounts).call());
    
    if (earnState.userVaultAddress) {
      document.getElementById('userVaultAddress').textContent = 
        earnState.userVaultAddress.substring(0, 10) + '...' + earnState.userVaultAddress.substring(38);
    }
    
    // Load BAYL treasury info
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    
    const totalTokens = DOMPurify.sanitize(await baylTreasury.methods.totalTokens().call());
    const totalShares = DOMPurify.sanitize(await baylTreasury.methods.totalShares().call());
    const refreshRate = DOMPurify.sanitize(await baylTreasury.methods.refreshRate().call());
    const claimRate = DOMPurify.sanitize(await baylTreasury.methods.claimRate().call());
    
    document.getElementById('baylTotalStaked').textContent = displayBAYAmount(totalTokens, 4);
    document.getElementById('baylTotalShares').textContent = totalShares;
    document.getElementById('baylRefreshRate').textContent = Math.floor(refreshRate / 86400) + ' days';
    document.getElementById('baylClaimRate').textContent = claimRate + ' blocks';
    
    // Load user staking info
    const userInfo = JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.accessPool(myaccounts).call())));
    document.getElementById('userShares').textContent = displayBAYAmount(userInfo.shares, 4);
    
    if (userInfo.lastRefresh > 0) {
      const lastRefreshDate = new Date(userInfo.lastRefresh * 1000);
      document.getElementById('userLastRefresh').textContent = lastRefreshDate.toLocaleString();
      
      // Check if user is stale (lastRefresh == 1 means paused)
      if (userInfo.lastRefresh == 1) {
        document.getElementById('userLastRefresh').innerHTML += ' <span style="color: red;">(Paused)</span>';
      }
    }
    
    // Get user's tracked coins
    const userCoins = JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.getUserCoins(myaccounts).call())));
    if (userCoins && userCoins.length > 0) {
      const coinNames = [];
      if (userCoins.includes(TREASURY_ADDRESSES.WETH)) coinNames.push('WETH');
      if (userCoins.includes(TREASURY_ADDRESSES.DAI)) coinNames.push('DAI');
      if (userCoins.includes(TREASURY_ADDRESSES.USDC)) coinNames.push('USDC');
      document.getElementById('userTrackingCoins').textContent =
        coinNames.join(', ') || 'None';
      // ✅ Get ALL pending rewards ONCE (same order as userCoins)
      const pendingRewards = JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.pendingReward(myaccounts).call())));
      let rewardsHTML = '';
      for (let i = 0; i < userCoins.length; i++) {
        const coin = userCoins[i];
        const pending = pendingRewards[i];
        if (isGreaterThanZero(pending)) {
          let coinName = coin.substring(0, 10) + '...';
          let pendingDisplay = '';

          if (coin.toLowerCase() === TREASURY_ADDRESSES.WETH.toLowerCase()) {
            coinName = 'WETH';
            pendingDisplay = displayETHAmount(pending, 6);
          } else if (coin.toLowerCase() === TREASURY_ADDRESSES.DAI.toLowerCase()) {
            coinName = 'DAI';
            pendingDisplay = displayETHAmount(pending, 6);
          } else if (coin.toLowerCase() === TREASURY_ADDRESSES.USDC.toLowerCase()) {
            coinName = 'USDC';
            pendingDisplay = displayUSDCAmount(pending, 6);
          }

          rewardsHTML += `<div>${coinName}: ${pendingDisplay}</div>`;
        }
      }
      document.getElementById('userPendingRewards').innerHTML = rewardsHTML || translateThis('No pending rewards');
    } else {
      document.getElementById('userPendingRewards').innerHTML = translateThis('No pending rewards');
      document.getElementById('userTrackingCoins').textContent = translateThis('None set');
    }
    
    // Display total rewards from localStorage
    let totalRewardsHTML = '';
    for (const [coin, amount] of Object.entries(earnState.userTotalRewards)) {
      totalRewardsHTML += `<div>${coin}: ${amount}</div>`;
    }
    document.getElementById('userTotalRewards').innerHTML = totalRewardsHTML || translateThis('No rewards collected yet');
    
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
        DOMPurify.sanitize(await vaultContract.methods.BAYL().call())
      );
      
      const bayrContract = new earnState.polWeb3.eth.Contract(
        [{
          "constant": true,
          "inputs": [{"name": "account", "type": "address"}],
          "name": "balanceOf",
          "outputs": [{"name": "", "type": "uint256"}],
          "type": "function"
        }],
        DOMPurify.sanitize(await vaultContract.methods.BAYR().call())
      );
      
      const baylBalance = DOMPurify.sanitize(await baylContract.methods.balanceOf(earnState.userVaultAddress).call());
      const bayrBalance = DOMPurify.sanitize(await bayrContract.methods.balanceOf(earnState.userVaultAddress).call());
      
      document.getElementById('vaultBaylBalance').textContent = displayBAYAmount(baylBalance, 4);
      document.getElementById('vaultBayrBalance').textContent = displayBAYAmount(bayrBalance, 4);
      
      document.getElementById('vaultBalances').classList.remove('hidden');
    }
    
    document.getElementById('userStakingInfo').classList.remove('hidden');
    
    // Check POL balance for gas warning
    const polBalance = DOMPurify.sanitize(await earnState.polWeb3.eth.getBalance(myaccounts));
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
    const topStakers = JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.getTopStakers().call())));
    
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
  if (!earnState.polWeb3 || !myaccounts || loginType !== 2) {
    await Swal.fire(translateThis('Error'), translateThis('Please login with password to stake'), 'error');
    return;
  }
  const result = await Swal.fire({
    title: translateThis('Staking Disclaimer'),
    html: `
      <p>`+translateThis("Rewards are not guaranteed and are based on users who opt-in. This system is not a security because users volunteer, there is no common enterprise and stakers do tasks for the rewards. In exchange for protocol fees, you are doing work by securing the blockchain, managing the stablecoin position, and voting on important protocol decisions. Additionally, your node will be tasked with occasionally covering gas fees in order to manage these positions and redeem rewards. Please make sure that you monitor your account and understand the source code.")+`</p>
      <p><a href="https://bitbay.market/downloads/whitepapers/Protocol-owned-assets.pdf" target="_blank"> `+translateThis("Click here to learn more about BitBay staking.")+`</a></p>
    `,
    icon: 'info',
    showCancelButton: true,
    confirmButtonText: translateThis('I Understand, Continue'),
    cancelButtonText: translateThis('Cancel')
  });
  if (!result.isConfirmed) return;
  var amount = document.getElementById('stakingDepositAmount').value;
  const BN = BigNumber;
  if (!amount || new BN(amount).lte(new BN('0'))) {
    await Swal.fire(translateThis('Error'), translateThis('Please enter a valid amount'), 'error');
    return;
  }
  try {
    showSpinner();
    const amount = BN(amount).times('1e8').toString();
    const vaultContract = new earnState.polWeb3.eth.Contract(vaultABI, TREASURY_ADDRESSES.VAULT);
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    // Check if this is first deposit - if so, set coins first
    const userCoins = JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.getUserCoins(myaccounts).call())));
    if (!userCoins || userCoins.length === 0) {
      // Set default coins: WETH, DAI, USDC
      const coins = [
        TREASURY_ADDRESSES.WETH, // WETH on Polygon
        TREASURY_ADDRESSES.DAI, // DAI on Polygon
        TREASURY_ADDRESSES.USDC
      ];
      Swal.fire(translateThis("Transaction Processing..."), translateThis("Setting the coins to track when checking for rewards: WETH, DAI, USDC"));
      await delay(500);
      await sendTx(baylTreasury, "setCoins", [coins], 200000, "0", false, false);
    }
    // Get BAYL address
    const baylAddress = DOMPurify.sanitize(await vaultContract.methods.BAYL().call());
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
    Swal.fire({
      icon: 'info',
      title: translateThis('Allowance'),
      text: translateThis('Authorizing BAYL allowance...'),
      showConfirmButton: false
    });
    await sendTx(baylContract, "approve", [TREASURY_ADDRESSES.VAULT, amount], 100000, "0", false, false);
    // Deposit to vault (which will stake to treasury)
    await sendTx(vaultContract, "depositLiquid", [amount], 1500000, "0", true, false);
    hideSpinner();
    await Swal.fire(translateThis('Success'), translateThis('BAYL staked successfully!'), 'success');
    await refreshEarnTab();
  } catch (error) {
    hideSpinner();
    console.error('Error staking BAYL:', error);
    await Swal.fire(translateThis('Error'), error.message || translateThis('Staking failed'), 'error');
  }
}

async function unstakeBAYL() {
  if (!earnState.polWeb3 || !myaccounts || loginType !== 2) {
    await Swal.fire(translateThis('Error'), translateThis('Please login with password to unstake'), 'error');
    return;
  }
  const BN = BigNumber;
  const result = await Swal.fire({
    title: translateThis('Unstake BAYL'),
    input: 'number',
    inputLabel: translateThis('Amount to unstake'),
    inputPlaceholder: '0.0',
    showCancelButton: true,
    inputValidator: (value) => {
      if (!value || new BN(value).lte(new BN('0'))) {
        return translateThis('Please enter a valid amount');
      }
    }
  });
  if (!result.isConfirmed) return;
  try {
    showSpinner();
    const amount = BN(result.value).times('1e8').toString();
    const vaultContract = new earnState.polWeb3.eth.Contract(vaultABI, TREASURY_ADDRESSES.VAULT);
    await sendTx(vaultContract, "withdrawLiquid", [amount], 1000000, "0", true, false);
    hideSpinner();
    await Swal.fire(translateThis('Success'), translateThis('BAYL unstaked successfully!'), 'success');
    await refreshEarnTab();
  } catch (error) {
    hideSpinner();
    console.error('Error unstaking BAYL:', error);
    await Swal.fire(translateThis('Error'), error.message || translateThis('Unstaking failed'), 'error');
  }
}

async function claimStakingRewards(showSwal = false) {
  if (!earnState.polWeb3 || !myaccounts || loginType !== 2) {
    if(showSwal) {
      await Swal.fire(translateThis('Error'), translateThis('Please login with password to claim rewards'), 'error');
    }
    return;
  }
  try {
    if(showSwal) {
      showSpinner();
    }
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);    
    // Get user's saved votes
    const savedVotes = JSON.parse(localStorage.getItem(myaccounts+'earnUserVotes') || '[]');
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
    const userCoins = JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.getUserCoins(myaccounts).call())));
    const pendingRewards = JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.pendingReward(myaccounts).call())));
    var foundRewards = false;
    for (let i = 0; i < userCoins.length; i++) {
      const coin = userCoins[i];
      const pending = pendingRewards[i];
      let coinName = coin;
      if (coin.toLowerCase() === TREASURY_ADDRESSES.WETH.toLowerCase()) coinName = 'WETH';
      if (coin.toLowerCase() === TREASURY_ADDRESSES.DAI.toLowerCase()) coinName = 'DAI';
      if (coin.toLowerCase() === TREASURY_ADDRESSES.USDC.toLowerCase()) coinName = 'USDC';
      if (parseInt(pending) > 0) {
        foundRewards = true;
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
    var tx;
    if(foundRewards || !showSwal) {
      tx = await sendTx(baylTreasury, "claimRewards", [TREASURY_ADDRESSES.VOTE_BAYL, votesToCast], 700000, "0", showSwal, false, showSwal);
    } else {
      if(showSwal) {
        await Swal.fire(translateThis("Transaction not sent"), translateThis("No rewards found."));
        hideSpinner();
      }
      console.log("No rewards found");
      return;
    }
    localStorage.setItem(myaccounts+'earnUserVotes', JSON.stringify(savedVotes));
    localStorage.setItem(myaccounts+'earnTotalRewards', JSON.stringify(earnState.userTotalRewards));
    if(showSwal) {
      hideSpinner();
    }
    let message = 'Stake claimed successfully';
    if (votesToCast.length > 0) {
      message += ` -- ${votesToCast.length} vote(s) cast.`;
    }
    if(!showSwal) {
      logToConsole(message+` -- tx: ${showResult(tx)}`);
    }
    if(showSwal) {
      await Swal.fire(translateThis('Success'), message, 'success');
    }
    await refreshEarnTab();
  } catch (error) {
    hideSpinner();
    console.error('Error claiming rewards:', error);
    if(showSwal) {
      await Swal.fire(translateThis('Error'), error.message || translateThis('Claiming rewards failed'), 'error');
    }
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
    const currentEpoch = DOMPurify.sanitize(await voteContract.methods.currentEpoch().call());
    document.getElementById('currentVoteEpoch').textContent = currentEpoch;
    
    // Get epoch block info
    const epochBlocks = DOMPurify.sanitize(await voteContract.methods.epochLength().call());
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
      const winningHash = DOMPurify.sanitize(await voteContract.methods.winningHash(prevEpoch).call());
      let prevHTML = '';
      
      if (winningHash && winningHash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        const weight = DOMPurify.sanitize(await voteContract.methods.winningWeight(prevEpoch).call());
        //const payload = DOMPurify.sanitize(JSON.stringify(await voteContract.methods.getProposalPayload(winningHash).call()));
        prevHTML += `<div><strong>Winner:</strong> <a href="#" onclick="showVotePayload('${winningHash}')">${winningHash.substring(0, 10)}...</a> (${weight} votes)</div>`;
      } else {
        prevHTML = 'No votes in last epoch';
      }
      document.getElementById('baylPreviousVotes').innerHTML = prevHTML;
    }
    
    // For current epoch: Show top 5 hashes (getEpochHashes)
    const topHashes = JSON.parse(DOMPurify.sanitize(JSON.stringify(await voteContract.methods.getEpochHashes(currentEpoch).call())));
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

async function showCreateVoteDialog() {
  // Load any saved votes from localStorage
  const savedVotes = JSON.parse(localStorage.getItem(myaccounts+'earnUserVotes') || '[]');
  
  await Swal.fire({
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

async function createVoteFromDialog() {
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
  const savedVotes = JSON.parse(localStorage.getItem(myaccounts+'earnUserVotes') || '[]');
  const newVote = {
    id: Date.now(),
    targetContract: targetContract,
    functions: functions,
    repeat: repeat,
    timesCast: 0
  };
  savedVotes.push(newVote);
  localStorage.setItem(myaccounts+'earnUserVotes', JSON.stringify(savedVotes));
  
  await Swal.fire(translateThis('Success'), translateThis('Vote created! It will be cast during your next reward claim.'), 'success');
  return true;
}

async function showVoteDetailsDialog() {
  const savedVotes = JSON.parse(localStorage.getItem(myaccounts+'earnUserVotes') || '[]');
  
  let html = '<div style="text-align: left;">';
  
  if (savedVotes.length === 0) {
    html += '<p>' + translateThis('You have not created any votes yet.') + '</p>';
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
  
  await Swal.fire({
    title: 'Your Votes',
    html: html,
    width: '500px',
    confirmButtonText: 'Close'
  });
}

function deleteVote(voteId) {
  const savedVotes = JSON.parse(localStorage.getItem(myaccounts+'earnUserVotes') || '[]');
  const filtered = savedVotes.filter(v => v.id !== voteId);
  localStorage.setItem(myaccounts+'earnUserVotes', JSON.stringify(filtered));
  Swal.close();
  showVoteDetailsDialog();
}

// ============================================================================
// ROI CALCULATION
// ============================================================================

async function calculateAndDisplayROI() {
  if (!earnState.polWeb3) return;
  
  try {
    // Try to use cached data first if it's recent (< 5 minutes old)
    const cachedData = localStorage.getItem('cachedROIData');
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      if (Date.now() - parsed.timestamp < 1440 * 60 * 1000) {
        const roiText = `📈 ${translateThis('Yearly Staking ROI')}: ${stripZeros(parsed.yearlyROI.toFixed(2))}%`;
        document.getElementById('earnRoiText').textContent = roiText;
        document.getElementById('earnRoiDisplay').classList.remove('hidden');
        return;
      }
    }
    
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    const totalTokens = DOMPurify.sanitize(await baylTreasury.methods.totalTokens().call());
    
    // Get current week
    const currentWeek = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    
    // Get prices
    const wethPriceRaw = await getWETHPrice();
    if (wethPriceRaw == "error") {
      throw new Error("Error getting WETH price");
    }
    const bayPriceRaw = await getBAYPrice();
    if (bayPriceRaw == "error") { 
      throw new Error("Error getting BAYL price");
    }
    var wethPrice = parseInt(wethPriceRaw) / 1e8;
    var bayPrice = parseInt(bayPriceRaw) / 1e8;
    
    const daiPrice = 1;
    const usdcPrice = 1;
    
    // Get weekly rewards for each coin
    const wethAddress = TREASURY_ADDRESSES.WETH;
    const daiAddress = TREASURY_ADDRESSES.DAI;
    const usdcAddress = TREASURY_ADDRESSES.USDC;
    
    const wethRewards = DOMPurify.sanitize(await baylTreasury.methods.weeklyRewards(currentWeek, wethAddress).call());
    const daiRewards = DOMPurify.sanitize(await baylTreasury.methods.weeklyRewards(currentWeek, daiAddress).call());
    const usdcRewards = DOMPurify.sanitize(await baylTreasury.methods.weeklyRewards(currentWeek, usdcAddress).call());
    
    const BN = BigNumber;
    const wethRewardsEther = new BN(wethRewards).dividedBy('1e18').toNumber();
    const daiRewardsEther = new BN(daiRewards).dividedBy('1e18').toNumber();
    const usdcRewardsFormatted = new BN(usdcRewards).dividedBy('1e6').toNumber();
    
    const weeklyRewardsUSD = (wethRewardsEther * wethPrice) + (daiRewardsEther * daiPrice) + (usdcRewardsFormatted * usdcPrice);
    const yearlyRewardsUSD = weeklyRewardsUSD * 52;
    
    const totalStakedBAY = new BN(totalTokens).dividedBy('1e8').toNumber();
    const totalStakedUSD = totalStakedBAY * bayPrice;
    let yearlyROI = 0;
    if (totalStakedUSD > 0) {
      yearlyROI = (yearlyRewardsUSD / totalStakedUSD) * 100;
    }
    const roiText = `📈 ${translateThis('Yearly Staking ROI')}: ${stripZeros(yearlyROI.toFixed(2))}%`;
    document.getElementById('earnRoiText').textContent = roiText;
    document.getElementById('earnRoiDisplay').classList.remove('hidden');
  } catch (error) {
    console.error('Error calculating ROI:', error);
  }
}

// ============================================================================
// REFRESH FUNCTIONS
// ============================================================================

async function loadTokenBalances() {
  if (!earnState.polWeb3 || !myaccounts) return;
  
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
    
    const daiBalance = DOMPurify.sanitize(await daiContract.methods.balanceOf(myaccounts).call());
    const daiBalanceEther = new BN(daiBalance).dividedBy('1e18');
    
    if (daiBalanceEther.gt(new BN('0'))) {
      document.getElementById('daiBalanceAmount').textContent = stripZeros(daiBalanceEther.toFixed(2));
      document.getElementById('daiBalance').classList.remove('hidden');
      //balances.DAI = stripZeros(daiBalanceEther.toFixed(2));
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
    
    const usdcBalance = DOMPurify.sanitize(await usdcContract.methods.balanceOf(myaccounts).call());
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
    
    const wethBalance = DOMPurify.sanitize(await wethContract.methods.balanceOf(myaccounts).call());
    const wethBalanceFormatted = new BN(wethBalance).dividedBy('1e18');
    
    if (wethBalanceFormatted.gt(new BN('0'))) {
      document.getElementById('wethBalanceAmount').textContent = stripZeros(wethBalanceFormatted.toFixed(4));
      document.getElementById('wethBalance').classList.remove('hidden');
      balances.WETH = stripZeros(wethBalanceFormatted.toFixed(4));
    }
    
    // Load POL balance
    const polBalance = DOMPurify.sanitize(await earnState.polWeb3.eth.getBalance(myaccounts));
    const polBalanceFormatted = new BN(polBalance).dividedBy('1e18');
    
    if (polBalanceFormatted.gt(new BN('0'))) {
      document.getElementById('polBalanceAmount').textContent = stripZeros(polBalanceFormatted.toFixed(2));
      document.getElementById('polBalance').classList.remove('hidden');
      //balances.POL = stripZeros(polBalanceFormatted.toFixed(2));
    }
    
    // Store balances for potential notification in main page
    if (Object.keys(balances).length > 0) {
      localStorage.setItem(myaccounts+'earnTabBalances', JSON.stringify(balances));
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

async function copyDepositAddress(coinType) {
  if (!myaccounts) {
    await Swal.fire(translateThis('Error'), translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  const address = myaccounts;
  
  // Copy to clipboard
  navigator.clipboard.writeText(address).then(async() => {
    await Swal.fire({
      title: `${coinType} ` + translateThis('Deposit Address'),
      html: `
        <p>${translateThis('Address copied to clipboard!')}</p>
        <p style="word-break: break-all; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 5px;">
          ${address}
        </p>
        <p style="margin-top: 10px; font-size: 0.9em; color: #777;">
          ${coinType === 'ETH' || coinType === 'Lido' ? translateThis('Network: Ethereum Mainnet') : translateThis('Network: Polygon')}
        </p>
      `,
      icon: 'success',
      confirmButtonText: translateThis('OK')
    });
  }).catch(async() => {
    await Swal.fire({
      title: `${coinType} ` + translateThis('Deposit Address'),
      html: `
        <p style="word-break: break-all; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 5px;">
          ${address}
        </p>
        <p style="margin-top: 10px; font-size: 0.9em; color: #777;">
          ${coinType === 'ETH' || coinType === 'Lido' ? translateThis('Network: Ethereum Mainnet') : translateThis('Network: Polygon')}
        </p>
      `,
      icon: 'info',
      confirmButtonText: translateThis('OK')
    });
  });
}

async function showWithdrawDialog() {
  if (!earnState.polWeb3 || !myaccounts) {
    await Swal.fire(translateThis('Error'), translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  // Get available balances
  const balances = [];
  
  try {
    const BN = BigNumber;
    
    // Check POL balance
    const polBalance = DOMPurify.sanitize(await earnState.polWeb3.eth.getBalance(myaccounts));
    const polBalanceFormatted = new BN(polBalance).dividedBy('1e18');
    if (polBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'POL', balance: stripZeros(polBalanceFormatted.toFixed(4)), network: 'Polygon' });
    }
    
    // Check USDC balance
    const usdcContract = new earnState.polWeb3.eth.Contract(
      [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
      TREASURY_ADDRESSES.USDC
    );
    const usdcBalance = DOMPurify.sanitize(await usdcContract.methods.balanceOf(myaccounts).call());
    const usdcBalanceFormatted = new BN(usdcBalance).dividedBy('1e6');
    if (usdcBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'USDC', balance: stripZeros(usdcBalanceFormatted.toFixed(2)), network: 'Polygon' });
    }
    
    // Check DAI balance
    const daiContract = new earnState.polWeb3.eth.Contract(
      [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
      TREASURY_ADDRESSES.DAI
    );
    const daiBalance = DOMPurify.sanitize(await daiContract.methods.balanceOf(myaccounts).call());
    const daiBalanceFormatted = new BN(daiBalance).dividedBy('1e18');
    if (daiBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'DAI', balance: stripZeros(daiBalanceFormatted.toFixed(2)), network: 'Polygon' });
    }
    
    // Check WETH balance
    const wethContract = new earnState.polWeb3.eth.Contract(
      [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
      TREASURY_ADDRESSES.WETH
    );
    const wethBalance = DOMPurify.sanitize(await wethContract.methods.balanceOf(myaccounts).call());
    const wethBalanceFormatted = new BN(wethBalance).dividedBy('1e18');
    if (wethBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'WETH', balance: stripZeros(wethBalanceFormatted.toFixed(4)), network: 'Polygon' });
    }
    
    // Check Ethereum balances if available
    if (earnState.ethWeb3) {
      const ethBalance = DOMPurify.sanitize(await earnState.ethWeb3.eth.getBalance(myaccounts));
      const ethBalanceFormatted = new BN(ethBalance).dividedBy('1e18');
      if (ethBalanceFormatted.gt(new BN('0'))) {
        balances.push({ coin: 'ETH', balance: stripZeros(ethBalanceFormatted.toFixed(4)), network: 'Ethereum' });
      }
      
      // Check Lido stETH balance
      const stETHContract = new earnState.ethWeb3.eth.Contract(
        [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
        TREASURY_ADDRESSES.LIDO_STETH
      );
      const stETHBalance = DOMPurify.sanitize(await stETHContract.methods.balanceOf(myaccounts).call());
      const stETHBalanceFormatted = new BN(stETHBalance).dividedBy('1e18');
      if (stETHBalanceFormatted.gt(new BN('0'))) {
        balances.push({ coin: 'stETH (Lido)', balance: stripZeros(stETHBalanceFormatted.toFixed(4)), network: 'Ethereum' });
      }
    }
    
    if (balances.length === 0) {
      await Swal.fire(translateThis('Info'), translateThis('No available balances to withdraw'), 'info');
      return;
    }
    
    // Build options HTML
    const optionsHTML = balances.map((b, idx) => 
      `<option value="${idx}">${b.coin} - ${b.balance} (${b.network})</option>`
    ).join('');
    
    const result = await Swal.fire({
      title: translateThis('Withdraw Coins'),
      html: `
        <div style="text-align: left;">
          <label style="display: block; margin-bottom: 5px;">${translateThis('Select coin to withdraw')}:</label>
          <select id="withdrawCoinSelect" class="swal2-select" style="width: 100%;">
            ${optionsHTML}
          </select>
          
          <label style="display: block; margin-top: 15px; margin-bottom: 5px;">${translateThis('Amount to withdraw')}:</label>
          <input type="number" id="withdrawAmount" class="swal2-input" placeholder="${translateThis('Enter amount')}" step="0.0001" style="width: 100%;" />
          
          <label style="display: block; margin-top: 15px; margin-bottom: 5px;">${translateThis('Recipient address')}:</label>
          <input type="text" id="withdrawAddress" class="swal2-input" placeholder="0x..." style="width: 100%;" />
          
          <div style="margin-top: 10px; font-size: 0.9em; color: #777;">
            ${translateThis('Leave amount empty to withdraw full balance')}
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: translateThis('Withdraw'),
      cancelButtonText: translateThis('Cancel'),
      preConfirm: () => {
        const coinIdx = parseInt(document.getElementById('withdrawCoinSelect').value);
        const amount = document.getElementById('withdrawAmount').value;
        const address = document.getElementById('withdrawAddress').value;
        
        if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
          Swal.showValidationMessage(translateThis('Please enter a valid Ethereum address'));
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
    await Swal.fire(translateThis('Error'), error.message, 'error');
  }
}

async function executeWithdrawal(withdrawData) {
  const { coin, amount, address } = withdrawData;
  showSpinner();
  try {
    const BN = BigNumber;
    if (coin.coin === 'POL') {
      // Withdraw POL
      let amountWei;
      if (amount) {
        amountWei = earnState.polWeb3.utils.toWei(amount, 'ether');
      } else {
        // Reserve gas for transaction when withdrawing full balance
        const balance = DOMPurify.sanitize(await earnState.polWeb3.eth.getBalance(myaccounts));
        const gasPrice2 = DOMPurify.sanitize(await earnState.polWeb3.eth.getGasPrice());
        const gasCost = (new BN(gasPrice2).times(50000)).times(1.5);
        amountWei = new BN(balance).minus(gasCost).toFixed(0);
        if (new BN(amountWei).lte(new BN('0'))) {
          throw new Error('Insufficient balance to cover gas fees');
        }
      }
      await sendTx("ETH",amountWei.toString(),[address],50000,"0",true);
    } else if (coin.coin === 'ETH') {
      // Withdraw ETH
      let amountWei;
      if (amount) {
        amountWei = earnState.ethWeb3.utils.toWei(amount, 'ether');
      } else {
        // Reserve gas for transaction when withdrawing full balance
        const balance = DOMPurify.sanitize(await earnState.ethWeb3.eth.getBalance(myaccounts));
        const ethGasPrice = DOMPurify.sanitize(await earnState.ethWeb3.eth.getGasPrice());
        const gasCost = (new BN(ethGasPrice).times(50000)).times(1.5);
        amountWei = new BN(balance).minus(gasCost).toFixed(0);
        if (new BN(amountWei).lte(new BN('0'))) {
          throw new Error('Insufficient balance to cover gas fees');
        }
      }
      await sendTx("ETH",amountWei.toString(),[address],50000,"0",true,true);
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
      const balance = DOMPurify.sanitize(await tokenContract.methods.balanceOf(myaccounts).call());
      const amountWei = amount ? new BN(amount).times(decimals).toFixed(0) : balance;
      if(coin.coin === 'stETH (Lido)') {
        await sendTx(tokenContract, "transfer", [address, amountWei], 100000, "0", true, false, true);
      } else {
        await sendTx(tokenContract, "transfer", [address, amountWei], 100000, "0", true, false);
      }
    }
    hideSpinner();
    await Swal.fire(translateThis('Success'), `${coin.coin} ` + translateThis('withdrawn successfully!'), 'success');
    await refreshEarnTab();
  } catch (error) {
    hideSpinner();
    console.error('Error withdrawing:', error);
    await Swal.fire(translateThis('Error'), error.message || translateThis('Withdrawal failed'), 'error');
  }
}

// ============================================================================
// REFRESH AND INITIALIZATION
// ============================================================================

async function refreshEarnTab() {
  // Don't refresh if user is not logged in
  if (!myaccounts || loginType === 0) {
    console.log('User not logged in, skipping Earn tab refresh');
    return;
  }
  
  const now = Date.now();
  
  // Refresh Ethereum data
  if (now - earnState.lastEthCheck > 300000) {
    earnState.lastEthCheck = now;
    await loadLidoVaultInfo();
    await loadUserLidoPosition();
    await loadETHBalances();
  }
  
  // Refresh Polygon data
  if (now - earnState.lastPolCheck > 180000) {    
    earnState.lastPolCheck = now;
    await calculateAndDisplayROI();
    await loadTokenBalances();
    await delay(15000);
    await loadStableVaultInfo();
    await delay(15000);
    await loadStakingInfo();
    await delay(15000);
    await loadTopStakers();
    await loadVotingInfo();
  }
}

// ============================================================================
// INITIALIZATION ON PAGE LOAD
// ============================================================================

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    initializeEarnTab();
    // Set up periodic refresh
    setInterval(refreshEarnTab, 300000); // Every five minutes
  });
}
