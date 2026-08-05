import { defaultUser } from "../constants/defaultUser";
import { useStorageState } from "../hooks/useStorageState";
import { useTodoSync } from "../hooks/useTodoSync";
import { User } from "../types/user";
import { UserContext } from "./UserContext";

export const UserContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useStorageState<User>(defaultUser, "user");

  // Background mirror of tasks/categories to the optional backend. It only
  // observes committed state, so the context value and every `setUser` call
  // site elsewhere stay exactly as they were.
  useTodoSync(user, setUser);

  return <UserContext.Provider value={{ user, setUser }}>{children}</UserContext.Provider>;
};
