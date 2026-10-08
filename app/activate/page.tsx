import AuthForm from "@/components/auth-form";
const env = process.env;
export const dynamic = "force-dynamic";
export default function Page() { return <AuthForm mode="activate" setupLoginId={env.AUTH_ADMIN_EMAIL}/>; }
