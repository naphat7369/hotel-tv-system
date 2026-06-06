package com.hotel.tvapp.ui.welcome

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.hotel.tvapp.R
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun WelcomeScreen(
    guestName: String = "Guest",
    roomNumber: String = "101"
) {
    // Current time state
    var currentTime by remember { mutableStateOf("") }
    var currentDate by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
        val dateFormat = SimpleDateFormat("EEEE, MMMM dd, yyyy", Locale.getDefault())
        while (true) {
            val now = Date()
            currentTime = timeFormat.format(now)
            currentDate = dateFormat.format(now)
            delay(1000) // Update every second
        }
    }

    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        // 1. Background Image
        Image(
            painter = painterResource(id = R.drawable.premium_bg),
            contentDescription = "Hotel Background",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )

        // 2. Gradient Overlay for readability and cinematic feel
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color(0xAA000000), // Darker towards bottom
                            Color(0xE6000000)
                        ),
                        startY = 0f,
                        endY = Float.POSITIVE_INFINITY
                    )
                )
        )

        // 3. Top Bar (Time & Date & Weather Mock)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(48.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column {
                Text(
                    text = currentTime,
                    color = Color.White,
                    fontSize = 56.sp,
                    fontWeight = FontWeight.Light,
                    letterSpacing = 2.sp
                )
                Text(
                    text = currentDate,
                    color = Color.LightGray,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            // Weather mock
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "☀️ 28°C",
                    color = Color.White,
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        // 4. Main Welcome Content
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 64.dp, bottom = 80.dp)
        ) {
            Text(
                text = "Welcome to",
                color = Color.LightGray,
                fontSize = 28.sp,
                fontWeight = FontWeight.Normal,
                letterSpacing = 4.sp
            )
            
            Text(
                text = "GRAND PALACE",
                color = Color.White,
                fontSize = 72.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 8.sp
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Box(
                modifier = Modifier
                    .height(2.dp)
                    .width(120.dp)
                    .background(Color(0xFFD4AF37)) // Gold accent line
            )
            
            Spacer(modifier = Modifier.height(32.dp))
            
            Text(
                text = "Dear $guestName,",
                color = Color.White,
                fontSize = 40.sp,
                fontWeight = FontWeight.Medium
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "We are delighted to have you. Enjoy your stay in Room $roomNumber.",
                color = Color(0xFFCCCCCC),
                fontSize = 24.sp,
                fontWeight = FontWeight.Normal
            )
            
            Spacer(modifier = Modifier.height(48.dp))
            
            // Interaction Hint
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .background(Color.White.copy(alpha = 0.2f), shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = "Press OK or Home to start",
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}
