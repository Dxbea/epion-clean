async function testEmail() {
  const payload = {
    sender: { email: 'epion.contact@gmail.com', name: 'Epion' },
    to: [{ email: 'epion.contact@gmail.com' }],
    subject: 'Test Email From Server',
    htmlContent: '<p>This is a test</p>'
  };

  console.log('Sending payload:', payload);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'api-key': 'xsmtpsib-9189d414cbcbc090d5724ef5f5e19bdab8900d78e778da728ac70d8640e2a8af-ZizVGntse90bHo24'
    },
    body: JSON.stringify(payload)
  });

  console.log('Status:', res.status);
  const data = await res.json().catch(() => null);
  console.log('Response JSON:', data);
}

testEmail();
