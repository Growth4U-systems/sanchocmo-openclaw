import { useQuery } from "@tanstack/react-query";

export interface ClientSummary {
  slug: string;
  name: string;
  emoji: string;
  phase: number;
  active: boolean;
  language: string;
}

export function useClients() {
  return useQuery<ClientSummary[]>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      const data = await res.json();
      return data.clients || [];
    },
    staleTime: 60_000,
  });
}
