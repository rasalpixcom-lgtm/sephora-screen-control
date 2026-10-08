import AuthForm from "@/components/auth-form";
import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
export default function Page() { return <AuthForm mode="activate" setupLoginId={env.AUTH_ADMIN_EMAIL}/>; }
