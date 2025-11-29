import React from 'react'
import PageContainer from '@/components/ui/PageContainer'
import { H2, Body } from '@/components/ui/Typography'

export default function AboutPage() {
  return (
    <PageContainer className="py-10 space-y-6">
      <H2>About Epion</H2>
      <Body>
        Epion is an AI-powered platform designed to help you verify, understand,
        and discuss information quickly and clearly.
      </Body>
      <Body>
        Our mission is to make information more accessible and reliable for everyone.
      </Body>
    </PageContainer>
  )
}
