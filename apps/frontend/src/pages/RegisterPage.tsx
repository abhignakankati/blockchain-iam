import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { getIdentityContract, errMsg } from "@/hooks/useIdentity";

const schema = z.object({
  name: z.string().min(2, "Enter your full name"),
  email: z.email("Enter a valid email"),
  department: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const STEPS = ["Save profile", "Confirm in wallet", "Confirm on-chain"] as const;
const field = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function RegisterPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(-1); // -1 idle, 0..2 = STEPS index in progress
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      setStep(0);
      const { data } = await api.post("/api/users/register-intent", values);
      setStep(1);
      const contract = await getIdentityContract(true);
      const tx = await contract.registerIdentity(data.offChainRefHash);
      setStep(2);
      await tx.wait();
      await qc.invalidateQueries({ queryKey: ["identity"] });
      navigate("/pending");
    } catch (err) {
      setError(errMsg(err));
      setStep(-1);
    }
  };

  const busy = step >= 0;
  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Register your identity</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your details stay off-chain. Only a hash is recorded on the blockchain, signed by your own wallet.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4 rounded-lg border border-border bg-card p-6">
        <label className="block text-sm font-medium">Full name
          <input className={field} disabled={busy} {...register("name")} />
          {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
        </label>
        <label className="block text-sm font-medium">Email
          <input className={field} disabled={busy} {...register("email")} />
          {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
        </label>
        <label className="block text-sm font-medium">Department (optional)
          <input className={field} disabled={busy} {...register("department")} />
        </label>

        {busy && (
          <ol className="space-y-1 text-sm">
            {STEPS.map((label, i) => (
              <li key={label} className={i < step ? "text-primary" : i === step ? "font-medium" : "text-muted-foreground"}>
                {i < step ? "✓" : i === step ? "…" : "○"} {label}
              </li>
            ))}
          </ol>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Working…" : "Register"}
        </Button>
      </form>
    </div>
  );
}
