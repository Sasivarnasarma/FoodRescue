import { Box, Container, Paper, Typography } from '@mui/material';

export default function App() {
  return (
    <Box component="main" sx={{ py: { xs: 6, sm: 10 } }}>
      <Container maxWidth="sm">
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 } }}>
          <Typography component="h1" variant="h3" color="primary.main">
            FoodRescue Admin
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            Donor and organization verification will be available after sign-in
            is set up.
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
