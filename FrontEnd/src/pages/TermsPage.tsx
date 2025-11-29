import React from 'react'
import PageContainer from '@/components/ui/PageContainer'
import { H2, Body } from '@/components/ui/Typography'

export default function TermsPage() {
  return (
    <PageContainer className="py-10 space-y-6">
      <H2>Terms of Service</H2>
      <Body>
        By using Epion, you agree to our terms and conditions. Please read them carefully.
      </Body>
      <Body>
        These terms apply to all users of Epion, including those accessing via web or mobile.
      </Body>
    </PageContainer>
  )
}
