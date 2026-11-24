"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, ShieldCheck, Users } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import SignOut from "@/components/sign-out";
import { ThemeToggle } from "@/components/theme-toggle";
import "./admin-dashboard.css";
import "./clients-management.css";

const sections = {
  clients: { title: "Clients", description: "Manage client workspaces.", icon: Building2 },
  users: { title: "Users", description: "Manage team accounts across all clients.", icon: Users },
};

export default function AdministrationShell({ section, email, actions, children }: {
  section: keyof typeof sections;
  email: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  const { title, description } = sections[section];
  return <SidebarProvider className="adm-shell clients-shell" style={{ "--sidebar-width": "15rem" } as CSSProperties}>
    <Sidebar collapsible="offcanvas" className="adm-sidebar">
      <SidebarHeader className="adm-sidebar-header">
        <Link href="/workspaces" className="adm-brand">
          <span className="adm-brand-icon"><ShieldCheck size={23} aria-hidden="true"/></span>
          <span><strong>PIXCOM</strong><small>ADMINISTRATION</small></span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="adm-sidebar-content">
        <SidebarGroup><SidebarGroupContent><SidebarMenu>
          {Object.entries(sections).map(([id, { title, icon: Icon }]) => <SidebarMenuItem key={id}>
            <SidebarMenuButton asChild isActive={section === id} size="lg" className="adm-nav-button">
              <Link href={`/admin/${id}`} aria-current={section === id ? "page" : undefined}>
                <Icon size={19} aria-hidden="true"/><span>{title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>)}
          <SidebarMenuItem><SidebarMenuButton asChild size="lg" className="adm-nav-button">
            <Link href="/workspaces"><ArrowLeft size={19} aria-hidden="true"/><span>Choose client</span></Link>
          </SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu></SidebarGroupContent></SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="adm-sidebar-footer">
        <div className="adm-account">
          <span className="adm-account-avatar">P</span><div><strong>Admin</strong><small>{email}</small></div>
          <SignOut className="adm-signout"/>
        </div>
      </SidebarFooter>
    </Sidebar>
    <SidebarInset className="adm-inset"><main className="clients-content">
      <header className="clients-heading">
        <div className="clients-heading-title"><SidebarTrigger/><div><h1>{title}</h1><p>{description}</p></div></div>
        <div className="clients-actions"><ThemeToggle/>{actions}</div>
      </header>
      {children}
    </main></SidebarInset>
  </SidebarProvider>;
}
