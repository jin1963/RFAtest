// main.js

// ตรวจสอบว่า web3.js ถูกโหลดแล้ว
if (typeof Web3 === 'undefined') {
  alert('Web3.js library not found. Please ensure it is loaded before this script.');
  console.error("CRITICAL ERROR: Web3.js is not loaded. Check script tag order and path.");
} else {
  console.log("Web3.js is detected.");
}

// Global Variables
let web3;
let account;
let stakingContract;
let routerContract;
let usdtContract; 
let kjcContract;  
let kjcDecimals;  
let usdtDecimals; 

// ABIs & Addresses - Expected to be defined in config.js
// (e.g., stakingABI, usdtABI, contractAddress, kjcAddress, usdtAddress, routerAddress, BSC_CHAIN_ID)

// ABI for PancakeSwap Router V2 (minimal)
const ROUTER_ABI_MINIMAL = [
  {
    "inputs":[
      {"internalType":"uint256","name":"amountIn","type":"uint256"},
      {"internalType":"address[]","name":"path","type":"address[]"}
    ],
    "name":"getAmountsOut",
    "outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],
    "stateMutability":"view",
    "type":"function"
  }
];

// Minimal ABI for ERC20 tokens
const ERC20_ABI_MINIMAL = [
  {"constant": true, "inputs": [], "name": "decimals", "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}], "payable": false, "stateMutability": "view", "type": "function"},
  {"constant": false, "inputs": [{"internalType": "address", "name": "spender", "type":"address"},{"internalType":"uint256", "name": "amount", "type":"uint256"}], "name": "approve", "outputs": [{"internalType": "bool", "name": "", "type":"bool"}], "payable": false, "stateMutability": "nonpayable", "type":"function"},
  {"constant": true, "inputs": [{"internalType": "address", "name": "owner", "type":"address"},{"internalType": "address", "name": "spender", "type":"address"}], "name": "allowance", "outputs": [{"internalType":"uint256", "name": "", "type":"uint256"}], "payable": false, "stateMutability":"view", "type":"function"}
];

// Chain ID for Binance Smart Chain Mainnet
// Note: This variable is now sourced from config.js, or uses '0x38' as fallback.
// The direct const declaration here was removed to avoid 'already been declared' error.
// The value will be taken from window.BSC_CHAIN_ID if config.js provides it.


// --- Helper Functions ---

async function getTokenDecimals(tokenContractInstance, fallbackDecimals = 18) {
    if (!tokenContractInstance) {
        console.warn("getTokenDecimals: Token contract instance not provided. Defaulting to", fallbackDecimals, "decimals.");
        return fallbackDecimals;
    }
    try {
        const decimals = await tokenContractInstance.methods.decimals().call();
        return parseInt(decimals);
    } catch (error) {
        console.error("getTokenDecimals: Failed to get token decimals from contract. Falling back to", fallbackDecimals, "decimals:", error);
        return fallbackDecimals;
    }
}

function displayWeiToToken(weiAmount, decimals) {
    if (!web3 || !weiAmount || typeof decimals === 'undefined' || isNaN(decimals)) return '0';
    try {
        const divisor = BigInt(10) ** BigInt(decimals);
        if (BigInt(weiAmount) === BigInt(0)) return '0'; 
        
        let amountStr = BigInt(weiAmount).toString();
        
        if (amountStr.length <= decimals) {
            amountStr = '0.' + '0'.repeat(decimals - amountStr.length) + amountStr;
        } else {
            amountStr = amountStr.slice(0, amountStr.length - decimals) + '.' + amountStr.slice(amountStr.length - decimals);
        }
        return amountStr.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');

    } catch (e) {
        console.error("displayWeiToToken: Error converting Wei to Token display:", e);
        return (parseFloat(weiAmount.toString()) / (10 ** decimals)).toString(); 
    }
}

function tokenToWei(tokenAmount, decimals) {
    if (!web3 || !tokenAmount || typeof decimals === 'undefined' || isNaN(decimals)) return '0';
    try {
        const [integer, fractional] = tokenAmount.toString().split('.');
        let weiAmount = BigInt(integer || '0') * (BigInt(10) ** BigInt(decimals));
        
        if (fractional) {
            if (fractional.length > decimals) {
                console.warn(`tokenToWei: Input fractional part '${fractional}' has more decimals than token (${decimals}). Truncating.`);
            }
            const paddedFractional = (fractional + '0'.repeat(decimals)).slice(0, decimals);
            weiAmount += BigInt(paddedFractional);
        }
        return weiAmount.toString();
    } catch (e) {
        console.error("tokenToWei: Error converting Token to Wei:", e);
        return web3.utils.toWei(tokenAmount.toString(), 'ether'); 
    }
}


// --- Main DApp Functions ---

async function connectWallet() {
  console.log("connectWallet: Function started.");
  document.getElementById("walletAddress").innerText = `กำลังเชื่อมต่อ...`;
  document.getElementById("walletAddress").classList.remove("success", "error");

  if (typeof window.ethereum === 'undefined') {
    alert("กรุณาติดตั้ง MetaMask หรือ Bitget Wallet หรือเปิด DApp ผ่าน Browser ใน Wallet App");
    document.getElementById("walletAddress").innerText = `❌ ไม่พบ Wallet Extension`;
    document.getElementById("walletAddress").classList.add("error");
    console.error("connectWallet: window.ethereum is undefined. Wallet extension not detected.");
    return;
  }
  
  try {
    web3 = new Web3(window.ethereum);
    console.log("connectWallet: Web3 instance created.");

    console.log("connectWallet: Requesting accounts...");
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    account = accounts[0];
    console.log("connectWallet: Connected account:", account);

    console.log("connectWallet: Getting current chain ID...");
    const currentChainId = await web3.eth.getChainId();
    const currentChainIdHex = web3.utils.toHex(currentChainId);
    
    // ใช้ BSC_CHAIN_ID จาก config.js หรือ fallback ถ้าไม่ได้กำหนด
    const currentBSC_CHAIN_ID = typeof window.BSC_CHAIN_ID !== 'undefined' ? window.BSC_CHAIN_ID : '0x38';
    console.log(`connectWallet: Current Chain ID (Hex): ${currentChainIdHex}, Expected: ${currentBSC_CHAIN_ID}`);


    if (currentChainIdHex !== currentBSC_CHAIN_ID) {
      console.warn(`connectWallet: Wrong network. Current: ${currentChainIdHex}, Expected: ${currentBSC_CHAIN_ID}. Attempting to switch.`);
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: currentBSC_CHAIN_ID }],
        });
        console.log("connectWallet: Network switch requested.");
        const newAccounts = await web3.eth.getAccounts();
        account = newAccounts[0];
        console.log("connectWallet: Switched to BSC. Connected account:", account);

      } catch (switchError) {
        if (switchError.code === 4902) {
          console.log("connectWallet: BSC network not found in wallet. Attempting to add it.");
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: currentBSC_CHAIN_ID,
                chainName: 'Binance Smart Chain Mainnet',
                nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                rpcUrls: ['https://bsc-dataseed.binance.org/'],
                blockExplorerUrls: ['https://bscscan.com/'],
              }],
            });
            console.log("connectWallet: BSC network add requested.");
            const newAccounts = await web3.eth.getAccounts();
            account = newAccounts[0];
            console.log("connectWallet: BSC network added. Connected account:", account);

          } catch (addError) {
            console.error("connectWallet: Error adding BSC network:", addError);
            alert("❌ กรุณาเพิ่ม Binance Smart Chain ในกระเป๋าของคุณด้วยตนเอง");
            document.getElementById("walletAddress").innerText = `❌ การเชื่อมต่อล้มเหลว`;
            document.getElementById("walletAddress").classList.add("error");
            return;
          }
        } else {
          console.error("connectWallet: Error switching network:", switchError);
          alert("❌ กรุณาสลับไป Binance Smart Chain ด้วยตนเอง");
          document.getElementById("walletAddress").innerText = `❌ การเชื่อมต่อล้มเหลว`;
          document.getElementById("walletAddress").classList.add("error");
          return;
        }
      }
    }

    document.getElementById("walletAddress").innerText = `✅ ${account}`;
    document.getElementById("walletAddress").classList.add("success");
    document.getElementById("walletAddress").classList.remove("error");
    console.log("connectWallet: Wallet address updated in UI.");

    // --- Initializing Contracts ---
    console.log("connectWallet: Initializing contracts...");
    // ตรวจสอบตัวแปรจาก config.js (ใช้ typeof window.variableName เพื่อให้แน่ใจว่าเป็น global)
    if (typeof window.contractAddress === 'undefined' || typeof window.stakingABI === 'undefined' ||
        typeof window.usdtAddress === 'undefined' || typeof window.usdtABI === 'undefined' ||
        typeof window.kjcAddress === 'undefined' || typeof window.routerAddress === 'undefined' ||
        typeof window.BSC_CHAIN_ID === 'undefined') { 
        
        console.error("connectWallet: Critical: One or more contract addresses/ABIs from config.js are undefined.");
        alert("❌ การตั้งค่า Contract ไม่สมบูรณ์ กรุณาตรวจสอบ config.js และลำดับการโหลด script (ดู Console สำหรับรายละเอียด).");
        document.getElementById("walletAddress").innerText = `❌ การเชื่อมต่อล้มเหลว: config.js error`;
        document.getElementById("walletAddress").classList.add("error");
        document.getElementById("walletAddress").classList.remove("success");
        return;
    }

    // ใช้ตัวแปรจาก config.js โดยตรง (ไม่ต้องใช้ window. นำหน้าแล้ว ถ้า config.js โหลดก่อน main.js ถูกต้อง)
    stakingContract = new web3.eth.Contract(stakingABI, contractAddress);
    routerContract = new web3.eth.Contract(ROUTER_ABI_MINIMAL, routerAddress); 
    usdtContract = new web3.eth.Contract(usdtABI, usdtAddress); 
    // หากคุณมี kjcABI ใน config.js และต้องการใช้ ให้เปลี่ยน ERC20_ABI_MINIMAL เป็น kjcABI
    kjcContract = new web3.eth.Contract(ERC20_ABI_MINIMAL, kjcAddress); 
    console.log("connectWallet: Contracts initialized successfully.");

    usdtDecimals = await getTokenDecimals(usdtContract, 18); 
    kjcDecimals = await getTokenDecimals(kjcContract, 18);  
    console.log(`connectWallet: USDT Decimals: ${usdtDecimals}, KJC Decimals: ${kjcDecimals}`);


    generateReferralLink();
    loadStakingInfo();
    loadReferralInfo(); 
    console.log("connectWallet: Connection successful and DApp functions called.");
  } catch (error) {
    console.error("❌ connectWallet: Uncaught error during connection process:", error);
    const errorMessage = getFriendlyErrorMessage(error);
    alert("❌ การเชื่อมต่อกระเป๋าของล้มเหลว: " + errorMessage); 
    document.getElementById("walletAddress").innerText = `❌ การเชื่อมต่อล้มเหลว`;
    document.getElementById("walletAddress").classList.add("error");
  }
}

function generateReferralLink() {
  if (!account) {
    document.getElementById("refLink").value = "โปรดเชื่อมต่อกระเป๋าเพื่อสร้างลิงก์";
    return;
  }
  const link = `${window.location.origin}${window.location.pathname}?ref=${account}`;
  document.getElementById("refLink").value = link;
}

function copyRefLink() {
  const input = document.getElementById("refLink");
  input.select();
  input.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(input.value);
  alert("✅ คัดลอกลิงก์เรียบร้อยแล้ว!");
}

function getReferrerFromURL() {
  if (web3 && web3.utils) { 
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get('ref');
      if (ref && web3.utils.isAddress(ref)) {
        document.getElementById("refAddress").value = ref;
      }
  } else {
      console.warn("getReferrerFromURL: web3 or web3.utils not available yet.");
  }
}

async function registerReferrer() {
  if (!stakingContract || !account) {
    alert("กรุณาเชื่อมกระเป๋าก่อน");
    return;
  }

  const ref = document.getElementById("refAddress").value;
  if (!web3.utils.isAddress(ref) || ref.toLowerCase() === account.toLowerCase()) {
    alert("❌ Referrer address ไม่ถูกต้อง หรือเป็น Address ของคุณเอง");
    return;
  }
  document.getElementById("registerStatus").innerText = "กำลังดำเนินการสมัคร Referrer...";
  document.getElementById("registerStatus"].classList.remove("error", "success");

  try {
    const txResponse = await stakingContract.methods.setReferrer(ref).send({ from: account });
    console.log("registerReferrer: Tx Hash:", txResponse.transactionHash);
    
    document.getElementById("registerStatus"].innerText = "กำลังรอการยืนยันการสมัคร Referrer...";

    const receipt = await web3.eth.getTransactionReceipt(txResponse.transactionHash);
    
    if (receipt && receipt.status) {
        document.getElementById("registerStatus"].innerText = "✅ สมัคร Referrer สำเร็จแล้ว!"; 
        document.getElementById("registerStatus"].classList.add("success");
        console.log("registerReferrer: Confirmed:", receipt);
    } else {
        document.getElementById("registerStatus"].innerText = "❌ การสมัคร Referrer ไม่สำเร็จ หรือธุรกรรมถูกปฏิ
