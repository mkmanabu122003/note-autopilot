import { createContext, useContext, useState, useEffect } from 'react';

const AccountContext = createContext();

export function AccountProvider({ children }) {
  const [accounts, setAccounts] = useState({});
  const [currentAccountId, setCurrentAccountId] = useState(null);

  useEffect(() => {
    window.electronAPI.accounts.list().then((accs) => {
      setAccounts(accs);
      const firstId = Object.keys(accs)[0];
      if (firstId) setCurrentAccountId(firstId);
    });
  }, []);

  const currentAccount = currentAccountId ? accounts[currentAccountId] : null;

  const switchAccount = (id) => setCurrentAccountId(id);

  const refreshAccounts = async () => {
    const accs = await window.electronAPI.accounts.list();
    setAccounts(accs);
  };

  return (
    <AccountContext.Provider value={{
      accounts, currentAccountId, currentAccount, switchAccount, refreshAccounts,
    }}>
      {children}
    </AccountContext.Provider>
  );
}

export const useAccount = () => useContext(AccountContext);
