"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, Briefcase, Building2, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { ContactSoftwareAccessSection } from "@/components/contacts/contact-software-access-section";

interface ContactDetail {
  id: string;
  firstName: string; lastName: string;
  email: string; phone: string | null; jobTitle: string | null;
  isVIP: boolean; isActive: boolean;
  organizationId: string;
  organization: { id: string; name: string; slug: string } | null;
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [contact, setContact] = useState<ContactDetail | null>(null);

  useEffect(() => {
    void fetch(`/api/v1/contacts/${id}`).then(async (r) => {
      if (r.ok) setContact(await r.json());
    });
  }, [id]);

  if (!contact) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <Link href="/contacts" className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 text-[12.5px]">
        <ArrowLeft className="h-4 w-4" /> Retour aux contacts
      </Link>

      <Card>
        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-[15px]">
                {contact.firstName[0]}{contact.lastName[0]}
              </div>
              <div>
                <h1 className="text-[20px] font-semibold text-slate-900">
                  {contact.firstName} {contact.lastName}
                  {contact.isVIP && <span className="ml-2 text-[11px] bg-amber-50 text-amber-800 ring-1 ring-amber-200 ring-inset rounded px-1.5 py-0.5">VIP</span>}
                </h1>
                {contact.jobTitle && <p className="mt-0.5 text-[12.5px] text-slate-500 inline-flex items-center gap-1"><Briefcase className="h-3 w-3" /> {contact.jobTitle}</p>}
                {contact.organization && (
                  <p className="mt-0.5 text-[12.5px] text-slate-500 inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    <Link href={`/organisations/${contact.organization.slug}`} className="hover:text-blue-600">{contact.organization.name}</Link>
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 pt-2 border-t border-slate-100">
            <div className="text-[12.5px]"><Mail className="inline h-3.5 w-3.5 text-slate-400 mr-1" /> <a href={`mailto:${contact.email}`} className="text-blue-700 hover:underline">{contact.email}</a></div>
            {contact.phone && <div className="text-[12.5px]"><Phone className="inline h-3.5 w-3.5 text-slate-400 mr-1" /> {contact.phone}</div>}
          </div>
        </div>
      </Card>

      <ContactSoftwareAccessSection contactId={contact.id} organizationId={contact.organizationId} />
    </div>
  );
}
