import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { PublicUser } from "@/lib/types";

type AuthContextValue = {
  user: PublicUser | null;
  isLoading: boolean;
  unreadNotifications: number;
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (input: { email: string; name: string; password: string; role: "REQUESTER" | "REVIEWER" }) => Promise<PublicUser>;
  demoLogin: (role: "requester" | "reviewer" | "admin") => Promise<PublicUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await api.auth.me();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return { user: null, unreadNotifications: 0 };
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 30_000,
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.auth.login({ email, password }),
  });

  const registerMutation = useMutation({
    mutationFn: (input: { email: string; name: string; password: string; role: "REQUESTER" | "REVIEWER" }) =>
      api.auth.register(input),
  });

  const demoMutation = useMutation({
    mutationFn: (role: "requester" | "reviewer" | "admin") => api.auth.demoLogin(role),
  });

  const logoutMutation = useMutation({ mutationFn: () => api.auth.logout() });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: meQuery.data?.user ?? null,
      isLoading: meQuery.isLoading,
      unreadNotifications: meQuery.data?.unreadNotifications ?? 0,
      login: async (email, password) => {
        const result = await loginMutation.mutateAsync({ email, password });
        queryClient.setQueryData(["auth", "me"], {
          user: result.user,
          unreadNotifications: 0,
        });
        await queryClient.invalidateQueries({
          predicate: (q) => q.queryKey[0] !== "auth" || q.queryKey[1] !== "me",
        });
        return result.user;
      },
      register: async (input) => {
        const result = await registerMutation.mutateAsync(input);
        queryClient.setQueryData(["auth", "me"], {
          user: result.user,
          unreadNotifications: 0,
        });
        await queryClient.invalidateQueries({
          predicate: (q) => q.queryKey[0] !== "auth" || q.queryKey[1] !== "me",
        });
        return result.user;
      },
      demoLogin: async (role) => {
        const result = await demoMutation.mutateAsync(role);
        queryClient.setQueryData(["auth", "me"], {
          user: result.user,
          unreadNotifications: 0,
        });
        await queryClient.invalidateQueries({
          predicate: (q) => q.queryKey[0] !== "auth" || q.queryKey[1] !== "me",
        });
        return result.user;
      },
      logout: async () => {
        await logoutMutation.mutateAsync();
        queryClient.clear();
        queryClient.setQueryData(["auth", "me"], {
          user: null,
          unreadNotifications: 0,
        });
      },
      refresh: async () => {
        await meQuery.refetch();
      },
    }),
    [meQuery, loginMutation, registerMutation, demoMutation, logoutMutation, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
