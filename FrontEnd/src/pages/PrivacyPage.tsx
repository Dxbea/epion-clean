import React from 'react'
import PageContainer from '@/components/ui/PageContainer'
import { H2, Body } from '@/components/ui/Typography'

export default function PrivacyPage() {
  return (
    <PageContainer className="py-10 space-y-6">
      <H2>Privacy Policy</H2>
      <Body>
        Your privacy is important to us. This page explains how Epion collects,
        uses, and protects your data.
      </Body>
      <Body>
        We only store what is necessary for your account and never share your
        personal information with third parties without your consent.
      </Body>
    </PageContainer>
  )
}
