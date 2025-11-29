import React from 'react'
import PageContainer from '@/components/ui/PageContainer'
import { H2, Body } from '@/components/ui/Typography'

export default function LegalPage() {
  return (
    <PageContainer className="py-10 space-y-6">
      <H2>Legal Notice</H2>
      <Body>
        Epion is provided as-is. This page contains the mandatory legal mentions.
      </Body>
      <Body>
        Company name, contact email, and registered address should be listed here.
      </Body>
    </PageContainer>
  )
}
