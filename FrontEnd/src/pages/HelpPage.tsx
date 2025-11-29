import React from 'react'
import PageContainer from '@/components/ui/PageContainer'
import { H2, Body } from '@/components/ui/Typography'

export default function HelpPage() {
  return (
    <PageContainer className="py-10 space-y-6">
      <H2>Help & Support</H2>
      <Body>
        Need assistance? You can find answers in our guide or contact support.
      </Body>
      <Body>
        FAQ and step-by-step tutorials will be available here soon.
      </Body>
    </PageContainer>
  )
}
