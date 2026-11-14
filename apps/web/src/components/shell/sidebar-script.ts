export const SIDEBAR_KEY = "listed:sidebar";

export const ACCOUNT_HINT_KEY = "listed:account-hint";

export const START_HERE_KEY = "drixie:start-here:funds";
export const SIDEBAR_SCRIPT = `(function(){try{var d=document.documentElement;if(localStorage.getItem(${JSON.stringify(SIDEBAR_KEY)})==="collapsed")d.setAttribute("data-sb","collapsed");var a=localStorage.getItem(${JSON.stringify(ACCOUNT_HINT_KEY)});if(a==="in"||a==="acct")d.setAttribute("data-acct",a);if(localStorage.getItem(${JSON.stringify(START_HERE_KEY)})==="off")d.setAttribute("data-start","off")}catch(e){}})()`;
